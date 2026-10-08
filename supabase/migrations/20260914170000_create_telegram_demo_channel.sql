begin;

create table if not exists public.telegram_vinculaciones (
  id uuid primary key default gen_random_uuid(),
  marca_id uuid not null references public.marcas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  token uuid not null default gen_random_uuid() unique,
  vence_en timestamptz not null default (now() + interval '15 minutes'),
  consumido_en timestamptz,
  creado_en timestamptz not null default now()
);

alter table public.telegram_vinculaciones enable row level security;

create policy telegram_vinculaciones_por_marca on public.telegram_vinculaciones
for select to authenticated
using (private.es_miembro_marca(marca_id));

alter table public.envios add column if not exists ultimo_error text;

create schema if not exists private;

create table if not exists private.telegram_despachos (
  envio_id uuid primary key references public.envios(id) on delete cascade,
  token uuid not null default gen_random_uuid() unique,
  vence_en timestamptz not null default (now() + interval '10 minutes'),
  consumido_en timestamptz,
  creado_en timestamptz not null default now()
);

revoke all on table private.telegram_despachos from public, anon, authenticated;

create or replace function public.obtener_estado_demo_telegram()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marca_id uuid;
  v_resultado jsonb;
begin
  select c.marca_id into v_marca_id
  from public.cuentas c
  where c.id = (select auth.uid()) and c.estado = 'activa';

  if v_marca_id is null then raise exception 'No encontramos una marca activa para esta cuenta.'; end if;

  select jsonb_build_object(
    'connection_state', coalesce(cn.estado, 'pendiente'),
    'customer_name', cl.nombre_visible,
    'consent_state', cl.consentimiento_estado,
    'consent_at', cl.consentimiento_fecha,
    'telegram_username', cl.contacto_canal #>> '{telegram,username}',
    'send_id', en.id,
    'send_state', en.estado,
    'telegram_message_id', en.identificador_externo,
    'sent_at', en.enviado_en,
    'last_error', coalesce(en.ultimo_error, cn.ultimo_error)
  ) into v_resultado
  from public.clientes cl
  left join public.conexiones cn on cn.marca_id = cl.marca_id and cn.tipo = 'telegram'
  left join public.carritos ca on ca.cliente_id = cl.id and ca.identificador_externo = 'DEMO-TN-CHECKOUT-001'
  left join public.evaluaciones ev on ev.carrito_id = ca.id
  left join public.promociones pm on pm.evaluacion_id = ev.id
  left join public.envios en on en.promocion_id = pm.id
  where cl.marca_id = v_marca_id and cl.identificador_externo = 'DEMO-TN-CUSTOMER-001'
  limit 1;

  return coalesce(v_resultado, jsonb_build_object('connection_state', 'pendiente', 'consent_state', 'desconocido'));
end;
$$;

create or replace function public.crear_vinculacion_demo_telegram()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marca_id uuid;
  v_cliente_id uuid;
  v_token uuid;
  v_vence_en timestamptz;
begin
  select c.marca_id into v_marca_id from public.cuentas c
  where c.id = (select auth.uid()) and c.estado = 'activa';
  if v_marca_id is null then raise exception 'No encontramos una marca activa para esta cuenta.'; end if;

  select cl.id into v_cliente_id from public.clientes cl
  where cl.marca_id = v_marca_id and cl.identificador_externo = 'DEMO-TN-CUSTOMER-001';
  if v_cliente_id is null then raise exception 'Primero sincronizá el checkout de Tiendanube Demo.'; end if;

  perform 1 from public.marcas ma where ma.id = v_marca_id for update;
  delete from public.telegram_vinculaciones tv
  where tv.marca_id = v_marca_id and tv.cliente_id = v_cliente_id and tv.consumido_en is null;

  insert into public.telegram_vinculaciones (marca_id, cliente_id)
  values (v_marca_id, v_cliente_id)
  returning token, vence_en into v_token, v_vence_en;

  insert into public.conexiones (marca_id, tipo, estado, permisos)
  values (v_marca_id, 'telegram', 'pendiente', array['send_messages'])
  on conflict (marca_id, tipo) do update set estado = 'pendiente', ultimo_error = null, error_en = null;

  return jsonb_build_object('token', v_token, 'expires_at', v_vence_en);
end;
$$;

create or replace function public.consumir_vinculacion_demo_telegram(
  p_token uuid,
  p_chat_id text,
  p_username text default null,
  p_bot_username text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vinculacion public.telegram_vinculaciones%rowtype;
begin
  select * into v_vinculacion from public.telegram_vinculaciones tv
  where tv.token = p_token and tv.consumido_en is null and tv.vence_en > now()
  for update;
  if v_vinculacion.id is null then raise exception 'La vinculación no existe, ya fue usada o venció.'; end if;
  if nullif(btrim(p_chat_id), '') is null then raise exception 'Telegram no informó un chat válido.'; end if;

  update public.telegram_vinculaciones set consumido_en = now() where id = v_vinculacion.id;
  update public.clientes set
    contacto_canal = jsonb_set(contacto_canal, '{telegram}', jsonb_build_object('chat_id', p_chat_id, 'username', nullif(btrim(p_username), '')), true),
    consentimiento_estado = 'otorgado',
    consentimiento_fecha = now()
  where id = v_vinculacion.cliente_id and marca_id = v_vinculacion.marca_id;

  insert into public.conexiones (marca_id, tipo, identificador_externo, estado, permisos, conectado_en)
  values (v_vinculacion.marca_id, 'telegram', nullif(btrim(p_bot_username), ''), 'conectada', array['send_messages'], now())
  on conflict (marca_id, tipo) do update set identificador_externo = excluded.identificador_externo, estado = 'conectada',
    permisos = excluded.permisos, conectado_en = now(), ultimo_error = null, error_en = null;

  return jsonb_build_object('linked', true, 'customer_id', v_vinculacion.cliente_id);
end;
$$;

create or replace function public.preparar_envio_demo_telegram(p_carrito_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marca_id uuid;
  v_cliente_id uuid;
  v_promocion_id uuid;
  v_conexion_id uuid;
  v_envio_id uuid;
  v_token uuid;
begin
  select c.marca_id into v_marca_id from public.cuentas c
  where c.id = (select auth.uid()) and c.estado = 'activa';
  if v_marca_id is null then raise exception 'No encontramos una marca activa para esta cuenta.'; end if;
  perform 1 from public.marcas ma where ma.id = v_marca_id for update;

  select ca.cliente_id, pm.id into v_cliente_id, v_promocion_id
  from public.carritos ca
  join public.evaluaciones ev on ev.carrito_id = ca.id and ev.resultado = 'elegible'
  join public.promociones pm on pm.evaluacion_id = ev.id and pm.estado_cupon in ('confirmado', 'usado')
  where ca.id = p_carrito_id and ca.marca_id = v_marca_id and ca.identificador_externo = 'DEMO-TN-CHECKOUT-001';
  if v_promocion_id is null then raise exception 'Primero procesá la oportunidad y confirmá el cupón.'; end if;

  if not exists (select 1 from public.clientes cl where cl.id = v_cliente_id and cl.marca_id = v_marca_id
    and cl.consentimiento_estado = 'otorgado' and nullif(cl.contacto_canal #>> '{telegram,chat_id}', '') is not null) then
    raise exception 'Lucía todavía no vinculó Telegram ni otorgó consentimiento.';
  end if;

  select cn.id into v_conexion_id from public.conexiones cn
  where cn.marca_id = v_marca_id and cn.tipo = 'telegram' and cn.estado = 'conectada';
  if v_conexion_id is null then raise exception 'El canal de Telegram no está conectado.'; end if;

  insert into public.envios (promocion_id, conexion_id, estado)
  values (v_promocion_id, v_conexion_id, 'pendiente')
  on conflict (promocion_id) do update set
    conexion_id = excluded.conexion_id,
    estado = case when public.envios.estado in ('enviado','entregado','leido','clic') then public.envios.estado else 'pendiente' end,
    ultimo_error = null
  returning id into v_envio_id;

  if exists (select 1 from public.envios en where en.id = v_envio_id and en.estado in ('enviado','entregado','leido','clic')) then
    return jsonb_build_object('send_id', v_envio_id, 'dispatch_token', null, 'already_sent', true);
  end if;

  insert into private.telegram_despachos (envio_id)
  values (v_envio_id)
  on conflict (envio_id) do update set token = gen_random_uuid(), vence_en = now() + interval '10 minutes', consumido_en = null
  returning token into v_token;

  return jsonb_build_object('send_id', v_envio_id, 'dispatch_token', v_token, 'already_sent', false);
end;
$$;

create or replace function public.tomar_envio_demo_telegram(p_envio_id uuid, p_dispatch_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  if not exists (select 1 from private.telegram_despachos td where td.envio_id = p_envio_id and td.token = p_dispatch_token
    and td.consumido_en is null and td.vence_en > now() for update) then
    raise exception 'El permiso de envío no existe, ya fue usado o venció.';
  end if;

  update private.telegram_despachos set consumido_en = now() where envio_id = p_envio_id;
  update public.envios set estado = 'enviando', ultimo_error = null where id = p_envio_id and estado in ('pendiente','fallido');

  select jsonb_build_object(
    'send_id', en.id,
    'chat_id', cl.contacto_canal #>> '{telegram,chat_id}',
    'customer_name', cl.nombre_visible,
    'coupon_code', pm.codigo_cupon,
    'coupon_percentage', pm.porcentaje,
    'expires_at', pm.vence_en,
    'product_name', it.nombre_producto,
    'original_total', ca.total,
    'discounted_total', round(ca.total * (1 - pm.porcentaje / 100), 2)
  ) into v_resultado
  from public.envios en
  join public.promociones pm on pm.id = en.promocion_id
  join public.evaluaciones ev on ev.id = pm.evaluacion_id
  join public.carritos ca on ca.id = ev.carrito_id
  join public.clientes cl on cl.id = ca.cliente_id
  left join public.items_carrito it on it.carrito_id = ca.id
  where en.id = p_envio_id
  limit 1;

  if v_resultado is null then raise exception 'No encontramos el envío solicitado.'; end if;
  return v_resultado;
end;
$$;

create or replace function public.confirmar_envio_demo_telegram(
  p_envio_id uuid,
  p_exitoso boolean,
  p_message_id text default null,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.envios set
    estado = case when p_exitoso then 'enviado' else 'fallido' end,
    identificador_externo = case when p_exitoso then p_message_id else identificador_externo end,
    enviado_en = case when p_exitoso then coalesce(enviado_en, now()) else enviado_en end,
    ultimo_error = case when p_exitoso then null else coalesce(nullif(btrim(p_error), ''), 'Telegram rechazó el envío.') end
  where id = p_envio_id;
  if not found then raise exception 'No encontramos el envío solicitado.'; end if;
  return jsonb_build_object('send_id', p_envio_id, 'state', case when p_exitoso then 'enviado' else 'fallido' end);
end;
$$;

create or replace function public.desconectar_demo_telegram()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marca_id uuid;
begin
  select c.marca_id into v_marca_id from public.cuentas c
  where c.id = (select auth.uid()) and c.estado = 'activa';
  if v_marca_id is null then raise exception 'No encontramos una marca activa para esta cuenta.'; end if;
  perform 1 from public.marcas ma where ma.id = v_marca_id for update;

  update public.clientes set contacto_canal = contacto_canal - 'telegram', consentimiento_estado = 'revocado'
  where marca_id = v_marca_id and identificador_externo = 'DEMO-TN-CUSTOMER-001';
  update public.conexiones set estado = 'desconectada', conectado_en = null
  where marca_id = v_marca_id and tipo = 'telegram';

  return public.obtener_estado_demo_telegram();
end;
$$;

create or replace function public.reiniciar_demo_tiendanube()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marca_id uuid;
begin
  select c.marca_id into v_marca_id from public.cuentas c where c.id = (select auth.uid()) and c.estado = 'activa';
  if v_marca_id is null then raise exception 'No encontramos una marca activa para esta cuenta.'; end if;
  perform 1 from public.marcas ma where ma.id = v_marca_id for update;

  delete from public.carritos where marca_id = v_marca_id and identificador_externo = 'DEMO-TN-CHECKOUT-001';
  delete from public.pedidos where marca_id = v_marca_id and identificador_externo = 'DEMO-TN-ORDER-001';
  delete from public.productos where marca_id = v_marca_id and identificador_externo = 'DEMO-TN-PRODUCT-001';
  delete from public.clientes where marca_id = v_marca_id and identificador_externo = 'DEMO-TN-CUSTOMER-001';
  update public.conexiones set estado = 'pendiente', conectado_en = null, ultimo_error = null
  where marca_id = v_marca_id and tipo in ('tiendanube', 'telegram');
  update public.marcas set plan_o_prueba = 'prueba', plan_inicio_en = null, plan_fin_en = null,
    estado = 'prueba', automatizacion_activa = false where id = v_marca_id;

  return jsonb_build_object('connection_state', 'pendiente', 'reset', true);
end;
$$;

create or replace function public.confirmar_compra_demo(p_carrito_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marca_id uuid;
  v_cliente_id uuid;
  v_promocion_id uuid;
  v_pedido_id uuid;
begin
  select c.marca_id into v_marca_id from public.cuentas c where c.id = (select auth.uid()) and c.estado = 'activa';
  if v_marca_id is null then raise exception 'No encontramos una marca activa para esta cuenta.'; end if;
  perform 1 from public.marcas ma where ma.id = v_marca_id for update;

  select ca.cliente_id, pm.id into v_cliente_id, v_promocion_id
  from public.carritos ca
  join public.evaluaciones ev on ev.carrito_id = ca.id and ev.resultado = 'elegible'
  join public.promociones pm on pm.evaluacion_id = ev.id and pm.estado_cupon in ('confirmado','usado')
  join public.envios en on en.promocion_id = pm.id and en.estado in ('enviado','entregado','leido','clic')
  where ca.id = p_carrito_id and ca.marca_id = v_marca_id and ca.identificador_externo = 'DEMO-TN-CHECKOUT-001';
  if v_promocion_id is null then raise exception 'Primero enviá la promoción por Telegram.'; end if;

  insert into public.pedidos (marca_id, cliente_id, identificador_externo, comprado_en, subtotal, descuento, total, moneda, estado)
  values (v_marca_id, v_cliente_id, 'DEMO-TN-ORDER-001', now(), 120000, 18000, 102000, 'ARS', 'pagado')
  on conflict (marca_id, identificador_externo) do update set estado = 'pagado'
  returning id into v_pedido_id;

  insert into public.atribuciones (promocion_id, pedido_id, resultado, cerrado_en, ventana_horas, monto_recuperado)
  values (v_promocion_id, v_pedido_id, 'atribuida', now(), 48, 102000)
  on conflict (promocion_id) do update set pedido_id = excluded.pedido_id, resultado = 'atribuida',
    cerrado_en = coalesce(public.atribuciones.cerrado_en, excluded.cerrado_en), monto_recuperado = 102000;
  update public.promociones set estado_cupon = 'usado' where id = v_promocion_id;
  update public.carritos set estado = 'recuperado' where id = p_carrito_id;
  return public.obtener_estado_demo_tiendanube();
end;
$$;

revoke all on function public.obtener_estado_demo_telegram() from public, anon;
revoke all on function public.crear_vinculacion_demo_telegram() from public, anon;
revoke all on function public.preparar_envio_demo_telegram(uuid) from public, anon;
revoke all on function public.desconectar_demo_telegram() from public, anon;
revoke all on function public.consumir_vinculacion_demo_telegram(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.tomar_envio_demo_telegram(uuid, uuid) from public, anon, authenticated;
revoke all on function public.confirmar_envio_demo_telegram(uuid, boolean, text, text) from public, anon, authenticated;

grant execute on function public.obtener_estado_demo_telegram() to authenticated;
grant execute on function public.crear_vinculacion_demo_telegram() to authenticated;
grant execute on function public.preparar_envio_demo_telegram(uuid) to authenticated;
grant execute on function public.desconectar_demo_telegram() to authenticated;
grant execute on function public.consumir_vinculacion_demo_telegram(uuid, text, text, text) to service_role;
grant execute on function public.tomar_envio_demo_telegram(uuid, uuid) to service_role;
grant execute on function public.confirmar_envio_demo_telegram(uuid, boolean, text, text) to service_role;

commit;
