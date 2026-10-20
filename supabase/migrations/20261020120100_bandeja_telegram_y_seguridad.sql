-- Fase 2a · Telegram como "bandeja de pruebas" (simula WhatsApp) para todos los clientes ficticios,
-- envío y compra simulada para cualquier caso, y cierre del hueco de seguridad en cuentas/marcas.
-- Compatible con la demo anterior: las funciones de Lucía siguen funcionando.

-- 1. La vinculación de Telegram pertenece a la marca, no a un cliente
alter table public.telegram_vinculaciones alter column cliente_id drop not null;
alter table public.conexiones add column if not exists detalles jsonb not null default '{}'::jsonb check (jsonb_typeof(detalles) = 'object');

create or replace function public.crear_vinculacion_demo_telegram()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_marca_id uuid := private.marca_de_usuario();
  v_cliente_id uuid;
  v_token uuid;
  v_vence_en timestamptz;
begin
  -- Compatibilidad: si existe la clienta de la demo anterior, la vinculación también la autoriza a ella.
  select cl.id into v_cliente_id from public.clientes cl where cl.marca_id = v_marca_id and cl.identificador_externo = 'DEMO-TN-CUSTOMER-001';
  perform 1 from public.marcas ma where ma.id = v_marca_id for update;
  delete from public.telegram_vinculaciones tv where tv.marca_id = v_marca_id and tv.consumido_en is null;
  insert into public.telegram_vinculaciones (marca_id, cliente_id) values (v_marca_id, v_cliente_id)
  returning token, vence_en into v_token, v_vence_en;
  insert into public.conexiones (marca_id, tipo, estado, permisos) values (v_marca_id, 'telegram', 'pendiente', array['send_messages'])
  on conflict (marca_id, tipo) do update set estado = case when public.conexiones.detalles ? 'chat_id' then public.conexiones.estado else 'pendiente' end,
    ultimo_error = null, error_en = null;
  return jsonb_build_object('token', v_token, 'expires_at', v_vence_en);
end;
$$;

create or replace function public.consumir_vinculacion_demo_telegram(p_token uuid, p_chat_id text, p_username text default null, p_bot_username text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_vinculacion public.telegram_vinculaciones%rowtype;
begin
  select * into v_vinculacion from public.telegram_vinculaciones tv
  where tv.token = p_token and tv.consumido_en is null and tv.vence_en > now() for update;
  if v_vinculacion.id is null then raise exception 'La vinculación no existe, ya fue usada o venció.'; end if;
  if nullif(btrim(p_chat_id), '') is null then raise exception 'Telegram no informó un chat válido.'; end if;

  update public.telegram_vinculaciones set consumido_en = now() where id = v_vinculacion.id;
  if v_vinculacion.cliente_id is not null then
    update public.clientes set
      contacto_canal = jsonb_set(contacto_canal, '{telegram}', jsonb_build_object('chat_id', p_chat_id, 'username', nullif(btrim(p_username), '')), true),
      consentimiento_estado = 'otorgado', consentimiento_fecha = now()
    where id = v_vinculacion.cliente_id and marca_id = v_vinculacion.marca_id;
  end if;

  insert into public.conexiones (marca_id, tipo, identificador_externo, estado, permisos, conectado_en, detalles)
  values (v_vinculacion.marca_id, 'telegram', nullif(btrim(p_bot_username), ''), 'conectada', array['send_messages'], now(),
    jsonb_build_object('chat_id', p_chat_id, 'username', nullif(btrim(p_username), '')))
  on conflict (marca_id, tipo) do update set identificador_externo = coalesce(excluded.identificador_externo, public.conexiones.identificador_externo),
    estado = 'conectada', permisos = excluded.permisos, conectado_en = now(), ultimo_error = null, error_en = null, detalles = excluded.detalles;
  return jsonb_build_object('linked', true, 'customer_id', v_vinculacion.cliente_id);
end;
$$;

create or replace function public.obtener_bandeja_telegram()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_marca_id uuid := private.marca_de_usuario();
  v_conexion public.conexiones%rowtype;
begin
  select * into v_conexion from public.conexiones where marca_id = v_marca_id and tipo = 'telegram';
  return jsonb_build_object(
    'connection_state', coalesce(v_conexion.estado, 'pendiente'),
    'linked', v_conexion.estado = 'conectada' and v_conexion.detalles ? 'chat_id',
    'telegram_username', v_conexion.detalles ->> 'username',
    'connected_at', v_conexion.conectado_en,
    'last_error', v_conexion.ultimo_error
  );
end;
$$;

-- 2. Envío de cualquier caso a la bandeja de pruebas
create or replace function public.preparar_envio_caso(p_carrito_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_marca_id uuid := private.marca_de_usuario();
  v_promocion_id uuid;
  v_consentimiento text;
  v_conexion_id uuid;
  v_envio_id uuid;
  v_token uuid;
begin
  perform 1 from public.marcas ma where ma.id = v_marca_id for update;
  select pm.id, cl.consentimiento_estado into v_promocion_id, v_consentimiento
  from public.carritos ca
  join public.clientes cl on cl.id = ca.cliente_id
  join public.evaluaciones ev on ev.carrito_id = ca.id and ev.resultado = 'elegible'
  join public.promociones pm on pm.evaluacion_id = ev.id and pm.estado_cupon in ('confirmado', 'usado')
  where ca.id = p_carrito_id and ca.marca_id = v_marca_id;
  if v_promocion_id is null then raise exception 'Primero evaluá el carrito: no hay una promoción lista para enviar.'; end if;
  if v_consentimiento <> 'otorgado' then raise exception 'El cliente no aceptó recibir mensajes.'; end if;

  select cn.id into v_conexion_id from public.conexiones cn
  where cn.marca_id = v_marca_id and cn.tipo = 'telegram' and cn.estado = 'conectada' and cn.detalles ? 'chat_id';
  if v_conexion_id is null then raise exception 'Vinculá la bandeja de pruebas de Telegram antes de enviar.'; end if;

  insert into public.envios (promocion_id, conexion_id, estado) values (v_promocion_id, v_conexion_id, 'pendiente')
  on conflict (promocion_id) do update set conexion_id = excluded.conexion_id,
    estado = case when public.envios.estado in ('enviado', 'entregado', 'leido', 'clic') then public.envios.estado else 'pendiente' end, ultimo_error = null
  returning id into v_envio_id;
  if exists (select 1 from public.envios en where en.id = v_envio_id and en.estado in ('enviado', 'entregado', 'leido', 'clic')) then
    return jsonb_build_object('send_id', v_envio_id, 'dispatch_token', null, 'already_sent', true);
  end if;

  insert into private.telegram_despachos (envio_id) values (v_envio_id)
  on conflict (envio_id) do update set token = gen_random_uuid(), vence_en = now() + interval '10 minutes', consumido_en = null
  returning token into v_token;
  return jsonb_build_object('send_id', v_envio_id, 'dispatch_token', v_token, 'already_sent', false);
end;
$$;

-- n8n toma el envío: ahora también devuelve el mensaje final y usa la bandeja de la marca.
create or replace function public.tomar_envio_demo_telegram(p_envio_id uuid, p_dispatch_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_resultado jsonb;
begin
  if not exists (select 1 from private.telegram_despachos td where td.envio_id = p_envio_id and td.token = p_dispatch_token
    and td.consumido_en is null and td.vence_en > now() for update) then
    raise exception 'El permiso de envío no existe, ya fue usado o venció.';
  end if;
  update private.telegram_despachos set consumido_en = now() where envio_id = p_envio_id;
  update public.envios set estado = 'enviando', ultimo_error = null where id = p_envio_id and estado in ('pendiente', 'fallido');

  select jsonb_build_object(
    'send_id', en.id,
    'chat_id', coalesce(cl.contacto_canal #>> '{telegram,chat_id}', cn.detalles ->> 'chat_id'),
    'customer_name', cl.nombre_visible,
    'coupon_code', pm.codigo_cupon,
    'coupon_percentage', pm.porcentaje,
    'expires_at', pm.vence_en,
    'product_name', it.productos,
    'original_total', ca.total,
    'discounted_total', coalesce((pm.detalles ->> 'total_final')::numeric, round(ca.total * (1 - coalesce(pm.porcentaje, 0) / 100), 2)),
    'mensaje', 'Demo · para ' || cl.nombre_visible || E'\n\n' ||
      private.mensaje_promocion(pm.tipo, cl.nombre_visible, it.productos, ca.total, pm.porcentaje, pm.vence_en, ma.zona_horaria)
  ) into v_resultado
  from public.envios en
  join public.conexiones cn on cn.id = en.conexion_id
  join public.promociones pm on pm.id = en.promocion_id
  join public.evaluaciones ev on ev.id = pm.evaluacion_id
  join public.carritos ca on ca.id = ev.carrito_id
  join public.marcas ma on ma.id = ca.marca_id
  join public.clientes cl on cl.id = ca.cliente_id
  cross join lateral (select string_agg(i.nombre_producto, ', ') as productos from public.items_carrito i where i.carrito_id = ca.id) it
  where en.id = p_envio_id;
  if v_resultado is null then raise exception 'No encontramos el envío solicitado.'; end if;
  return v_resultado;
end;
$$;

-- 3. Compra simulada de cualquier caso con promoción enviada
create or replace function public.confirmar_compra_caso(p_carrito_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_marca_id uuid := private.marca_de_usuario();
  v_carrito public.carritos%rowtype;
  v_promocion public.promociones%rowtype;
  v_final numeric;
  v_pedido_id uuid;
begin
  select * into v_carrito from public.carritos where id = p_carrito_id and marca_id = v_marca_id and origen = 'demo' for update;
  if v_carrito.id is null then raise exception 'Solo se puede simular la compra de un caso de demostración de tu marca.'; end if;
  if v_carrito.estado = 'recuperado' then return private.caso_json(p_carrito_id); end if;

  select pm.* into v_promocion from public.evaluaciones ev join public.promociones pm on pm.evaluacion_id = ev.id
  join public.envios en on en.promocion_id = pm.id and en.estado in ('enviado', 'entregado', 'leido', 'clic')
  where ev.carrito_id = p_carrito_id;
  if v_promocion.id is null then raise exception 'Primero enviá la promoción: sin contacto no hay venta atribuible.'; end if;
  if v_promocion.vence_en < now() then raise exception 'La promoción ya venció.'; end if;

  v_final := coalesce((v_promocion.detalles ->> 'total_final')::numeric, v_carrito.total);
  insert into public.pedidos (marca_id, cliente_id, identificador_externo, comprado_en, subtotal, descuento, total, estado, origen)
  values (v_marca_id, v_carrito.cliente_id, 'DEMO-ORDER-' || replace(p_carrito_id::text, '-', ''), now(), v_carrito.total, v_carrito.total - v_final, v_final, 'pagado', 'demo')
  returning id into v_pedido_id;
  insert into public.atribuciones (promocion_id, pedido_id, resultado, cerrado_en, ventana_horas, monto_recuperado)
  values (v_promocion.id, v_pedido_id, 'atribuida', now(), extract(epoch from v_promocion.vence_en - v_promocion.creado_en)::int / 3600, v_final)
  on conflict (promocion_id) do update set pedido_id = excluded.pedido_id, resultado = 'atribuida', cerrado_en = excluded.cerrado_en, monto_recuperado = excluded.monto_recuperado;
  update public.promociones set estado_cupon = 'usado' where id = v_promocion.id;
  update public.carritos set estado = 'recuperado' where id = p_carrito_id;
  return private.caso_json(p_carrito_id);
end;
$$;

-- 4. Seguridad: una cuenta solo puede crearse para una marca sin dueño, y no puede cambiar su marca, rol ni estado
create or replace function private.marca_sin_cuentas(p_marca_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.cuentas where marca_id = p_marca_id);
$$;
revoke all on function private.marca_sin_cuentas(uuid) from public, anon;
grant execute on function private.marca_sin_cuentas(uuid) to authenticated;

drop policy if exists cuentas_crear_propia on public.cuentas;
create policy cuentas_crear_propia on public.cuentas for insert to authenticated
  with check (id = (select auth.uid()) and private.marca_sin_cuentas(marca_id));

revoke update on public.cuentas from anon, authenticated;
grant update (nombre_visible, ultimo_acceso) on public.cuentas to authenticated;
revoke update on public.marcas from anon, authenticated;
grant update (nombre, zona_horaria) on public.marcas to authenticated;

-- Creación atómica de marca y cuenta (la usará el registro nuevo, incluido el acceso con Google)
create or replace function public.crear_marca_y_cuenta(p_marca text, p_nombre text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := (select auth.uid());
  v_email text;
  v_marca_id uuid;
begin
  if v_usuario is null then raise exception 'Necesitás iniciar sesión.'; end if;
  select marca_id into v_marca_id from public.cuentas where id = v_usuario;
  if v_marca_id is not null then return v_marca_id; end if;
  if length(btrim(coalesce(p_marca, ''))) < 2 or length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'Completá el nombre de la marca y tu nombre.';
  end if;
  select email into v_email from auth.users where id = v_usuario;
  insert into public.marcas (nombre) values (btrim(p_marca)) returning id into v_marca_id;
  insert into public.cuentas (id, marca_id, email, nombre_visible) values (v_usuario, v_marca_id, v_email, btrim(p_nombre));
  return v_marca_id;
end;
$$;

-- 5. Permisos
revoke all on function public.obtener_bandeja_telegram() from public, anon;
revoke all on function public.preparar_envio_caso(uuid) from public, anon;
revoke all on function public.confirmar_compra_caso(uuid) from public, anon;
revoke all on function public.crear_marca_y_cuenta(text, text) from public, anon;
revoke all on function public.crear_vinculacion_demo_telegram() from public, anon;
revoke all on function public.consumir_vinculacion_demo_telegram(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.tomar_envio_demo_telegram(uuid, uuid) from public, anon, authenticated;
grant execute on function public.obtener_bandeja_telegram() to authenticated;
grant execute on function public.preparar_envio_caso(uuid) to authenticated;
grant execute on function public.confirmar_compra_caso(uuid) to authenticated;
grant execute on function public.crear_marca_y_cuenta(text, text) to authenticated;
grant execute on function public.crear_vinculacion_demo_telegram() to authenticated;
grant execute on function public.consumir_vinculacion_demo_telegram(uuid, text, text, text) to service_role;
grant execute on function public.tomar_envio_demo_telegram(uuid, uuid) to service_role;
