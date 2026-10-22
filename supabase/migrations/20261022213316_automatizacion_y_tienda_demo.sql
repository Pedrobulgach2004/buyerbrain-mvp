-- Automatización y tienda demo. Solo agrega columnas, una tabla de configuración y funciones; no borra datos.
-- 1. La marca puede pausar BuyerBrain: en pausa no se envía ningún mensaje.
-- 2. El mensaje al cliente lleva el código del cupón, un enlace para terminar la compra y la firma de la marca.
-- 3. El enlace abre una tienda demo pública: el cliente ve su carrito y "paga" (compra simulada que se atribuye sola).
-- 4. "Simular nuevo carrito" y "Adelantar el tiempo" permiten mostrar la automatización en vivo.
-- 5. La regla de frecuencia cuenta solo promociones realmente enviadas (antes contaba también las no enviadas).

alter table public.marcas add column if not exists envios_pausados boolean not null default false;
alter table public.promociones add column if not exists enlace_token uuid not null default gen_random_uuid();
create unique index if not exists promociones_enlace_token_idx on public.promociones (enlace_token);

create table if not exists private.configuracion (clave text primary key, valor text not null);
insert into private.configuracion (clave, valor) values ('url_app', 'https://buyerbrain-mvp-3tjb.vercel.app')
on conflict (clave) do nothing;

create or replace function private.decidir_recuperacion(p_carrito_id uuid, p_politica public.politicas_marketing, p_ahora timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_carrito public.carritos%rowtype;
  v_consentimiento boolean;
  v_compro boolean;
  v_ultima timestamptz;
  v_stock integer;
  v_en_oferta boolean;
  v_checks jsonb := '[]'::jsonb;
  v_dias integer;
  v_contacto timestamptz;
  v_vence timestamptz := p_ahora + make_interval(hours => p_politica.vencimiento_horas);
  v_bloqueo_oferta boolean;
  v_descuento numeric;
  v_permitidas jsonb := p_politica.promociones_permitidas;
  v_motivo text;
begin
  select * into v_carrito from public.carritos where id = p_carrito_id;
  select coalesce(cl.consentimiento_estado = 'otorgado', false) into v_consentimiento from public.clientes cl where cl.id = v_carrito.cliente_id;
  v_consentimiento := coalesce(v_consentimiento, false);
  select exists (
    select 1 from public.pedidos pe
    where pe.cliente_id = v_carrito.cliente_id and pe.comprado_en > v_carrito.creado_en
      and not exists (select 1 from public.atribuciones a where a.pedido_id = pe.id)
  ) into v_compro;
  -- Solo cuentan las promociones que realmente le llegaron al cliente.
  select max(en.enviado_en) into v_ultima
  from public.promociones pm
  join public.envios en on en.promocion_id = pm.id and en.estado in ('enviado', 'entregado', 'leido', 'clic')
  join public.evaluaciones ev on ev.id = pm.evaluacion_id
  join public.carritos c2 on c2.id = ev.carrito_id
  where c2.cliente_id = v_carrito.cliente_id and c2.id <> v_carrito.id and en.enviado_en <= p_ahora;
  select coalesce(min(pr.stock), 0), coalesce(bool_or(pr.en_oferta), false) into v_stock, v_en_oferta
  from public.items_carrito it join public.productos pr on pr.id = it.producto_id
  where it.carrito_id = v_carrito.id;

  if v_compro then
    v_checks := v_checks || jsonb_build_object('id', 'compra', 'label', 'Compra posterior', 'passed', false, 'detail', 'El cliente ya compró por su cuenta.');
    return jsonb_build_object('outcome', 'descartar', 'regla', 'compra', 'reason', 'El cliente completó la compra sin ayuda: no hace falta un incentivo.', 'checks', v_checks);
  end if;

  v_checks := v_checks || jsonb_build_object('id', 'consentimiento', 'label', 'Consentimiento', 'passed', v_consentimiento,
    'detail', case when v_consentimiento then 'Aceptó recibir mensajes.' else 'No aceptó recibir mensajes.' end);
  if not v_consentimiento then
    return jsonb_build_object('outcome', 'bloquear', 'regla', 'consentimiento', 'reason', 'Sin consentimiento del cliente no se envía ningún mensaje.', 'checks', v_checks);
  end if;

  if v_ultima is not null then
    v_dias := floor(extract(epoch from p_ahora - v_ultima) / 86400);
    v_checks := v_checks || jsonb_build_object('id', 'frecuencia', 'label', 'Frecuencia de contacto', 'passed', extract(epoch from p_ahora - v_ultima) / 86400 >= p_politica.frecuencia_dias,
      'detail', format('Último contacto hace %s días (mínimo %s).', v_dias, p_politica.frecuencia_dias));
    if extract(epoch from p_ahora - v_ultima) / 86400 < p_politica.frecuencia_dias then
      return jsonb_build_object('outcome', 'bloquear', 'regla', 'frecuencia', 'checks', v_checks,
        'reason', format('Ya recibió una promoción hace %s días; la regla permite una cada %s.', v_dias, p_politica.frecuencia_dias));
    end if;
  else
    v_checks := v_checks || jsonb_build_object('id', 'frecuencia', 'label', 'Frecuencia de contacto', 'passed', true, 'detail', 'Sin contactos previos.');
  end if;

  v_contacto := v_carrito.creado_en + make_interval(hours => p_politica.espera_horas);
  v_checks := v_checks || jsonb_build_object('id', 'espera', 'label', 'Espera antes del contacto', 'passed', p_ahora >= v_contacto,
    'detail', format('Se contacta %s h después del abandono.', p_politica.espera_horas));
  if p_ahora < v_contacto then
    return jsonb_build_object('outcome', 'esperar', 'regla', 'espera', 'checks', v_checks, 'contact_at', v_contacto,
      'reason', format('Todavía puede volver solo: se contacta %s h después del abandono.', p_politica.espera_horas));
  end if;

  v_checks := v_checks || jsonb_build_object('id', 'monto', 'label', 'Monto mínimo', 'passed', v_carrito.total >= p_politica.monto_minimo,
    'detail', format('Carrito de %s (mínimo %s).', private.formato_ars(v_carrito.total), private.formato_ars(p_politica.monto_minimo)));
  if v_carrito.total < p_politica.monto_minimo then
    v_motivo := 'El carrito no alcanza el monto mínimo para un incentivo.';
    if v_permitidas ? 'recordatorio' then
      return jsonb_build_object('outcome', 'recordatorio', 'regla', 'monto', 'checks', v_checks, 'expires_at', v_vence, 'reason', v_motivo || ' Se envía solo un recordatorio.');
    end if;
    return jsonb_build_object('outcome', 'bloquear', 'regla', 'monto', 'checks', v_checks, 'reason', v_motivo || ' El recordatorio no está permitido.');
  end if;

  v_checks := v_checks || jsonb_build_object('id', 'stock', 'label', 'Stock mínimo', 'passed', v_stock >= p_politica.stock_minimo,
    'detail', format('Quedan %s unidades (mínimo %s).', v_stock, p_politica.stock_minimo));
  if v_stock < p_politica.stock_minimo then
    v_motivo := 'Hay poco stock: no conviene incentivar este producto.';
    if v_permitidas ? 'recordatorio' then
      return jsonb_build_object('outcome', 'recordatorio', 'regla', 'stock', 'checks', v_checks, 'expires_at', v_vence, 'reason', v_motivo || ' Se envía solo un recordatorio.');
    end if;
    return jsonb_build_object('outcome', 'bloquear', 'regla', 'stock', 'checks', v_checks, 'reason', v_motivo || ' El recordatorio no está permitido.');
  end if;

  v_bloqueo_oferta := v_en_oferta and p_politica.no_combinar_ofertas;
  v_checks := v_checks || jsonb_build_object('id', 'oferta', 'label', 'Sin combinar con ofertas', 'passed', not v_bloqueo_oferta,
    'detail', case when v_en_oferta then 'El producto ya tiene precio de oferta.' else 'Precio sin oferta.' end);

  v_descuento := case when v_carrito.total >= p_politica.umbral_escalon then p_politica.descuento_maximo
    else least(p_politica.descuento_escalon, p_politica.descuento_maximo) end;
  if v_permitidas ? 'descuento' and not v_bloqueo_oferta and v_descuento > 0 then
    v_checks := v_checks || jsonb_build_object('id', 'descuento', 'label', 'Descuento permitido', 'passed', true,
      'detail', format('%s%% porque el carrito %s (máximo %s%%).', v_descuento::int,
        case when v_carrito.total >= p_politica.umbral_escalon then 'supera ' else 'es menor a ' end || private.formato_ars(p_politica.umbral_escalon),
        p_politica.descuento_maximo::int));
    return jsonb_build_object('outcome', 'descuento', 'regla', null, 'checks', v_checks, 'discount', v_descuento::int,
      'final_total', round(v_carrito.total * (1 - v_descuento / 100)), 'expires_at', v_vence,
      'reason', format('Se ofrece %s%% de descuento dentro de las reglas.', v_descuento::int));
  end if;

  v_motivo := case when v_bloqueo_oferta then 'El producto ya está en oferta y el descuento no se combina.' else 'El descuento no está disponible para este carrito.' end;
  if v_permitidas ? 'envio_gratis' then
    return jsonb_build_object('outcome', 'envio_gratis', 'regla', case when v_bloqueo_oferta then 'oferta' end, 'checks', v_checks, 'expires_at', v_vence, 'reason', v_motivo || ' Se ofrece envío gratis.');
  end if;
  if v_permitidas ? 'recordatorio' then
    return jsonb_build_object('outcome', 'recordatorio', 'regla', case when v_bloqueo_oferta then 'oferta' end, 'checks', v_checks, 'expires_at', v_vence, 'reason', v_motivo || ' Se envía solo un recordatorio.');
  end if;
  return jsonb_build_object('outcome', 'bloquear', 'regla', case when v_bloqueo_oferta then 'oferta' else 'promociones' end, 'checks', v_checks, 'reason', v_motivo || ' No hay incentivo permitido.');
end;
$$;

create or replace function public.preparar_envio_caso(p_carrito_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_marca_id uuid := private.marca_de_usuario();
  v_promocion public.promociones%rowtype;
  v_consentimiento text;
  v_vencimiento_horas integer;
  v_conexion_id uuid;
  v_envio public.envios%rowtype;
  v_envio_id uuid;
  v_token uuid;
begin
  perform 1 from public.marcas ma where ma.id = v_marca_id for update;
  if exists (select 1 from public.marcas ma where ma.id = v_marca_id and ma.envios_pausados) then
    raise exception 'BuyerBrain está en pausa: reanudalo para enviar mensajes.';
  end if;
  select pm.* into v_promocion
  from public.carritos ca
  join public.evaluaciones ev on ev.carrito_id = ca.id and ev.resultado = 'elegible'
  join public.promociones pm on pm.evaluacion_id = ev.id and pm.estado_cupon in ('confirmado', 'usado')
  where ca.id = p_carrito_id and ca.marca_id = v_marca_id;
  select cl.consentimiento_estado into v_consentimiento
  from public.carritos ca join public.clientes cl on cl.id = ca.cliente_id
  where ca.id = p_carrito_id and ca.marca_id = v_marca_id;
  if v_promocion.id is null then raise exception 'Primero aplicá tus reglas a este carrito: no hay un mensaje listo para enviar.'; end if;
  if v_consentimiento <> 'otorgado' then raise exception 'El cliente no aceptó recibir mensajes.'; end if;

  select * into v_envio from public.envios where promocion_id = v_promocion.id;
  if v_envio.estado in ('enviado', 'entregado', 'leido', 'clic') then
    return jsonb_build_object('send_id', v_envio.id, 'dispatch_token', null, 'already_sent', true);
  end if;
  if v_envio.estado = 'enviando' and exists (
    select 1 from private.telegram_despachos td where td.envio_id = v_envio.id and td.consumido_en > now() - interval '2 minutes'
  ) then
    raise exception 'Este mensaje ya se está enviando. Esperá unos segundos y actualizá la pantalla.';
  end if;
  if v_promocion.tipo <> 'recordatorio' and v_promocion.vence_en < now() then
    raise exception 'El cupón venció antes de enviarse. Revisá el carrito de nuevo para generar uno nuevo.';
  end if;

  select cn.id into v_conexion_id from public.conexiones cn
  where cn.marca_id = v_marca_id and cn.tipo = 'telegram' and cn.estado = 'conectada' and cn.detalles ? 'chat_id';
  if v_conexion_id is null then raise exception 'Vinculá tu Telegram antes de enviar.'; end if;

  -- El plazo para usar el cupón (o para atribuir la compra de un recordatorio) cuenta desde el envío.
  select pol.vencimiento_horas into v_vencimiento_horas
  from public.evaluaciones ev join public.politicas_marketing pol on pol.id = ev.politica_id where ev.id = v_promocion.evaluacion_id;
  update public.promociones set vence_en = now() + make_interval(hours => coalesce(v_vencimiento_horas, 48)) where id = v_promocion.id;

  insert into public.envios (promocion_id, conexion_id, estado) values (v_promocion.id, v_conexion_id, 'pendiente')
  on conflict (promocion_id) do update set conexion_id = excluded.conexion_id, estado = 'pendiente', ultimo_error = null
  returning id into v_envio_id;

  insert into private.telegram_despachos (envio_id) values (v_envio_id)
  on conflict (envio_id) do update set token = gen_random_uuid(), vence_en = now() + interval '10 minutes', consumido_en = null
  returning token into v_token;
  return jsonb_build_object('send_id', v_envio_id, 'dispatch_token', v_token, 'already_sent', false);
end;
$$;

create or replace function public.cambiar_pausa_envios(p_pausar boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_marca_id uuid := private.marca_de_usuario();
begin
  if v_marca_id is null then raise exception 'No encontramos tu marca.'; end if;
  update public.marcas set envios_pausados = coalesce(p_pausar, false) where id = v_marca_id;
  return jsonb_build_object('envios_pausados', coalesce(p_pausar, false));
end;
$$;

-- Mensaje completo que recibe el cliente: el texto de la promoción, el cupón, el enlace y la firma.
create or replace function private.mensaje_cliente(p_promocion_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select private.mensaje_promocion(pm.tipo, cl.nombre_visible, it.productos, ca.total, pm.porcentaje, pm.vence_en, ma.zona_horaria)
    || case when pm.codigo_cupon is not null then E'\n\nTu cupón: ' || pm.codigo_cupon else '' end
    || E'\n' || case when pm.tipo = 'recordatorio' then 'Tu carrito te espera acá: ' else 'Terminá tu compra acá: ' end
    || (select valor from private.configuracion where clave = 'url_app') || '/tienda/' || pm.enlace_token
    || E'\n\n' || ma.nombre
  from public.promociones pm
  join public.evaluaciones ev on ev.id = pm.evaluacion_id
  join public.carritos ca on ca.id = ev.carrito_id
  join public.marcas ma on ma.id = ca.marca_id
  join public.clientes cl on cl.id = ca.cliente_id
  cross join lateral (select string_agg(i.nombre_producto, ', ') as productos from public.items_carrito i where i.carrito_id = ca.id) it
  where pm.id = p_promocion_id;
$$;

create or replace function private.caso_json(p_carrito_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', ca.id,
    'origen', ca.origen,
    'historial', ca.identificador_externo like 'DEMO-HIST-%',
    'estado', ca.estado,
    'creado_en', ca.creado_en,
    'total', ca.total,
    'cliente', cl.nombre_visible,
    'consentimiento', cl.consentimiento_estado,
    'producto', (select string_agg(it.nombre_producto, ', ') from public.items_carrito it where it.carrito_id = ca.id),
    'stock', (select min(pr.stock) from public.items_carrito it join public.productos pr on pr.id = it.producto_id where it.carrito_id = ca.id),
    'en_oferta', (select coalesce(bool_or(pr.en_oferta), false) from public.items_carrito it join public.productos pr on pr.id = it.producto_id where it.carrito_id = ca.id),
    -- Datos que usa la vista previa de Reglas de promoción para decidir igual que private.decidir_recuperacion
    'ultima_promocion_en', (select max(en2.enviado_en) from public.promociones pm2 join public.envios en2 on en2.promocion_id = pm2.id and en2.estado in ('enviado', 'entregado', 'leido', 'clic')
      join public.evaluaciones ev2 on ev2.id = pm2.evaluacion_id join public.carritos c2 on c2.id = ev2.carrito_id
      where c2.cliente_id = ca.cliente_id and c2.id <> ca.id and en2.enviado_en <= now()),
    'compro_despues', exists (select 1 from public.pedidos pe where pe.cliente_id = ca.cliente_id and pe.comprado_en > ca.creado_en
      and not exists (select 1 from public.atribuciones a where a.pedido_id = pe.id)),
    'decision', ev.decision,
    'motivo', ev.motivo,
    'regla_bloqueante', ev.regla_bloqueante,
    'controles', coalesce(ev.controles_realizados, '[]'::jsonb),
    'evaluado_en', ev.evaluado_en,
    'promocion', case when pm.id is null then null else jsonb_build_object(
      'id', pm.id, 'tipo', pm.tipo, 'porcentaje', pm.porcentaje, 'codigo', pm.codigo_cupon, 'vence_en', pm.vence_en,
      'estado', pm.estado_cupon, 'total_final', (pm.detalles ->> 'total_final')::numeric,
      'mensaje', private.mensaje_cliente(pm.id)
    ) end,
    'envio', case when en.id is null then null else jsonb_build_object('id', en.id, 'estado', en.estado, 'enviado_en', en.enviado_en, 'error', en.ultimo_error) end,
    'atribucion', case when atr.id is null then null else jsonb_build_object('resultado', atr.resultado, 'monto', atr.monto_recuperado, 'cerrado_en', atr.cerrado_en) end
  )
  from public.carritos ca
  join public.marcas ma on ma.id = ca.marca_id
  left join public.clientes cl on cl.id = ca.cliente_id
  left join public.evaluaciones ev on ev.carrito_id = ca.id
  left join public.promociones pm on pm.evaluacion_id = ev.id
  left join public.envios en on en.promocion_id = pm.id
  left join public.atribuciones atr on atr.promocion_id = pm.id
  where ca.id = p_carrito_id;
$$;

-- n8n toma el envío: el texto es el mismo que ve la marca en Seguimiento (sin el prefijo "Demo").
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
    'mensaje', private.mensaje_cliente(pm.id)
  ) into v_resultado
  from public.envios en
  join public.conexiones cn on cn.id = en.conexion_id
  join public.promociones pm on pm.id = en.promocion_id
  join public.evaluaciones ev on ev.id = pm.evaluacion_id
  join public.carritos ca on ca.id = ev.carrito_id
  join public.clientes cl on cl.id = ca.cliente_id
  where en.id = p_envio_id;
  if v_resultado is null then raise exception 'No encontramos el envío solicitado.'; end if;
  return v_resultado;
end;
$$;

-- Simula que un cliente nuevo abandona un carrito y lo revisa enseguida con las reglas vigentes.
create or replace function public.simular_carrito_abandonado()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_marca_id uuid := private.marca_de_usuario();
  v_espera numeric;
  v_nombres text[] := array['Martina Díaz', 'Julián Herrera', 'Carolina Vázquez', 'Federico Molina', 'Agustina Rojas', 'Nicolás Benítez',
    'Florencia Acosta', 'Santiago Medina', 'Micaela Romero', 'Joaquín Torres', 'Delfina Castro', 'Lautaro Suárez', 'Lucía Gómez', 'Diego Sosa'];
  v_nombre text;
  v_producto public.productos%rowtype;
  v_cliente_id uuid;
  v_carrito_id uuid;
  v_creado timestamptz;
begin
  if v_marca_id is null then raise exception 'No encontramos tu marca.'; end if;
  if (select count(*) from public.carritos where marca_id = v_marca_id and identificador_externo like 'DEMO-SIM-%' and creado_en > now() - interval '1 day') >= 30 then
    raise exception 'Llegaste al máximo de 30 carritos simulados por día.';
  end if;
  select pr.* into v_producto from public.productos pr where pr.marca_id = v_marca_id and pr.origen = 'demo' order by random() limit 1;
  if v_producto.id is null then raise exception 'Primero cargá los escenarios de demostración.'; end if;
  select espera_horas into v_espera from public.politicas_marketing where marca_id = v_marca_id and vigente_hasta is null;
  v_nombre := v_nombres[1 + floor(random() * array_length(v_nombres, 1))::int];

  -- Si el cliente ya existe, se reutiliza: así la regla de frecuencia puede frenarlo de verdad.
  select id into v_cliente_id from public.clientes where marca_id = v_marca_id and origen = 'demo' and nombre_visible = v_nombre limit 1;
  if v_cliente_id is null then
    insert into public.clientes (marca_id, identificador_externo, nombre_visible, consentimiento_estado, consentimiento_fecha, origen)
    values (v_marca_id, 'DEMO-CLI-SIM-' || replace(gen_random_uuid()::text, '-', ''), v_nombre,
      case when random() < 0.9 then 'otorgado' else 'desconocido' end, now() - interval '30 days', 'demo')
    returning id into v_cliente_id;
  end if;

  -- Abandonó hace un rato: ya pasó el tiempo de espera de tus reglas, así BuyerBrain puede actuar enseguida.
  v_creado := now() - make_interval(mins => (coalesce(v_espera, 2) * 60)::int + 5 + floor(random() * 40)::int);
  insert into public.carritos (marca_id, cliente_id, identificador_externo, creado_en, detectado_en, total, estado, origen)
  values (v_marca_id, v_cliente_id, 'DEMO-SIM-' || replace(gen_random_uuid()::text, '-', ''), v_creado, v_creado + interval '1 minute', v_producto.precio_actual, 'detectado', 'demo')
  returning id into v_carrito_id;
  insert into public.items_carrito (carrito_id, producto_id, identificador_producto_externo, nombre_producto, cantidad, precio_unitario)
  values (v_carrito_id, v_producto.id, v_producto.identificador_externo, v_producto.nombre, 1, v_producto.precio_actual);

  return public.evaluar_carrito(v_carrito_id);
end;
$$;

-- Demo: hace como si ya hubiera pasado el tiempo de espera de un carrito y lo vuelve a revisar.
create or replace function public.adelantar_espera_demo(p_carrito_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_marca_id uuid := private.marca_de_usuario();
  v_espera numeric;
  v_carrito public.carritos%rowtype;
begin
  select * into v_carrito from public.carritos where id = p_carrito_id and marca_id = v_marca_id and origen = 'demo' for update;
  if v_carrito.id is null then raise exception 'Solo se puede adelantar el tiempo de un carrito de demostración de tu marca.'; end if;
  select espera_horas into v_espera from public.politicas_marketing where marca_id = v_marca_id and vigente_hasta is null;
  update public.carritos
  set creado_en = least(creado_en, now() - make_interval(mins => (coalesce(v_espera, 2) * 60)::int + 1)),
      detectado_en = least(creado_en, now() - make_interval(mins => (coalesce(v_espera, 2) * 60)::int + 1))
  where id = p_carrito_id;
  return public.evaluar_carrito(p_carrito_id);
end;
$$;

-- Tienda demo pública: lo que ve el cliente al abrir el enlace del mensaje. Solo datos de ese carrito.
create or replace function public.ver_carrito_demo(p_enlace uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'marca', ma.nombre,
    'cliente', split_part(btrim(cl.nombre_visible), ' ', 1),
    'producto', (select string_agg(it.nombre_producto, ', ') from public.items_carrito it where it.carrito_id = ca.id),
    'total', ca.total,
    'total_final', coalesce((pm.detalles ->> 'total_final')::numeric, ca.total),
    'tipo', pm.tipo,
    'porcentaje', pm.porcentaje,
    'codigo', pm.codigo_cupon,
    'vence_en', pm.vence_en,
    'zona_horaria', ma.zona_horaria,
    'estado', case when ca.estado = 'recuperado' then 'pagado' when pm.vence_en < now() then 'vencido'
      when en.estado in ('enviado', 'entregado', 'leido', 'clic') then 'disponible' else 'no_disponible' end
  )
  from public.promociones pm
  join public.evaluaciones ev on ev.id = pm.evaluacion_id
  join public.carritos ca on ca.id = ev.carrito_id and ca.origen = 'demo'
  join public.marcas ma on ma.id = ca.marca_id
  join public.clientes cl on cl.id = ca.cliente_id
  left join public.envios en on en.promocion_id = pm.id
  where pm.enlace_token = p_enlace;
$$;

-- El cliente "paga" en la tienda demo: se registra el pedido y se atribuye a la promoción, como en una compra real.
create or replace function public.pagar_carrito_demo(p_enlace uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_promocion public.promociones%rowtype;
  v_carrito public.carritos%rowtype;
  v_final numeric;
  v_pedido_id uuid;
begin
  select pm.* into v_promocion from public.promociones pm where pm.enlace_token = p_enlace for update;
  if v_promocion.id is null then raise exception 'Este enlace no existe.'; end if;
  select ca.* into v_carrito from public.evaluaciones ev join public.carritos ca on ca.id = ev.carrito_id
  where ev.id = v_promocion.evaluacion_id and ca.origen = 'demo' for update of ca;
  if v_carrito.id is null then raise exception 'Este enlace no corresponde a una tienda de demostración.'; end if;
  if v_carrito.estado = 'recuperado' then return public.ver_carrito_demo(p_enlace); end if;
  if not exists (select 1 from public.envios en where en.promocion_id = v_promocion.id and en.estado in ('enviado', 'entregado', 'leido', 'clic')) then
    raise exception 'Este carrito todavía no está disponible.';
  end if;
  if v_promocion.vence_en < now() then raise exception 'La promoción ya venció.'; end if;

  v_final := coalesce((v_promocion.detalles ->> 'total_final')::numeric, v_carrito.total);
  insert into public.pedidos (marca_id, cliente_id, identificador_externo, comprado_en, subtotal, descuento, total, estado, origen)
  values (v_carrito.marca_id, v_carrito.cliente_id, 'DEMO-ORDER-' || replace(v_carrito.id::text, '-', ''), now(), v_carrito.total, v_carrito.total - v_final, v_final, 'pagado', 'demo')
  returning id into v_pedido_id;
  insert into public.atribuciones (promocion_id, pedido_id, resultado, cerrado_en, ventana_horas, monto_recuperado)
  values (v_promocion.id, v_pedido_id, 'atribuida', now(), greatest(1, extract(epoch from v_promocion.vence_en - v_promocion.creado_en)::int / 3600), v_final)
  on conflict (promocion_id) do update set pedido_id = excluded.pedido_id, resultado = 'atribuida', cerrado_en = excluded.cerrado_en, monto_recuperado = excluded.monto_recuperado;
  update public.promociones set estado_cupon = 'usado' where id = v_promocion.id;
  update public.carritos set estado = 'recuperado' where id = v_carrito.id;
  return public.ver_carrito_demo(p_enlace);
end;
$$;

revoke all on function public.cambiar_pausa_envios(boolean) from public, anon;
grant execute on function public.cambiar_pausa_envios(boolean) to authenticated;
revoke all on function public.simular_carrito_abandonado() from public, anon;
grant execute on function public.simular_carrito_abandonado() to authenticated;
revoke all on function public.adelantar_espera_demo(uuid) from public, anon;
grant execute on function public.adelantar_espera_demo(uuid) to authenticated;
revoke all on function public.ver_carrito_demo(uuid) from public;
grant execute on function public.ver_carrito_demo(uuid) to anon, authenticated;
revoke all on function public.pagar_carrito_demo(uuid) from public;
grant execute on function public.pagar_carrito_demo(uuid) to anon, authenticated;
revoke all on function private.mensaje_cliente(uuid) from public;
