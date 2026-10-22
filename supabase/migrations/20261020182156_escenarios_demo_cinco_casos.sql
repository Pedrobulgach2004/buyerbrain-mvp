-- Demo Day: los escenarios actuales bajan de 9 a 5, uno por cada decisión posible
-- (descuento, envío gratis, recordatorio, bloqueo y espera). El historial de 4 semanas no cambia.
-- Igual que antes, solo borra y recrea datos con origen 'demo' de la marca del usuario.
-- Debe coincidir con Frontend/src/lib/demoCases.ts.
create or replace function public.cargar_escenarios_demo()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_marca_id uuid := private.marca_de_usuario();
  v_ahora timestamptz := now();
  v_politica_id uuid;
  v_telegram_id uuid;
  r record;
  v_cliente_id uuid;
  v_carrito_id uuid;
  v_eval_id uuid;
  v_promo_id uuid;
  v_pedido_id uuid;
  v_creado timestamptz;
  v_final numeric;
begin
  perform 1 from public.marcas where id = v_marca_id for update;

  insert into public.conexiones (marca_id, tipo, identificador_externo, estado, permisos, conectado_en)
  values (v_marca_id, 'tiendanube', 'DEMO-TN-STORE-001', 'conectada', array['read_products', 'read_checkouts', 'read_orders', 'write_coupons'], v_ahora)
  on conflict (marca_id, tipo) do update set estado = 'conectada', identificador_externo = excluded.identificador_externo, permisos = excluded.permisos, conectado_en = coalesce(public.conexiones.conectado_en, excluded.conectado_en);
  insert into public.conexiones (marca_id, tipo, estado, permisos) values (v_marca_id, 'telegram', 'pendiente', array['send_messages'])
  on conflict (marca_id, tipo) do nothing;
  select id into v_telegram_id from public.conexiones where marca_id = v_marca_id and tipo = 'telegram';

  select id into v_politica_id from public.politicas_marketing where marca_id = v_marca_id and vigente_hasta is null;
  if v_politica_id is null then
    insert into public.politicas_marketing (marca_id, version, promociones_permitidas)
    values (v_marca_id, coalesce((select max(version) from public.politicas_marketing where marca_id = v_marca_id), 0) + 1, '["recordatorio","descuento","envio_gratis"]')
    returning id into v_politica_id;
  end if;

  -- Limpieza de la demostración anterior (solo datos ficticios de esta marca)
  delete from public.telegram_vinculaciones where marca_id = v_marca_id and cliente_id in (select id from public.clientes where marca_id = v_marca_id and origen = 'demo');
  delete from public.carritos where marca_id = v_marca_id and origen = 'demo';
  delete from public.pedidos where marca_id = v_marca_id and origen = 'demo';
  delete from public.clientes where marca_id = v_marca_id and origen = 'demo';
  delete from public.productos where marca_id = v_marca_id and origen = 'demo';

  insert into public.productos (marca_id, identificador_externo, nombre, precio_actual, stock, en_oferta, origen)
  values
    (v_marca_id, 'DEMO-PROD-campera', 'Campera Nébula', 120000, 20, false, 'demo'),
    (v_marca_id, 'DEMO-PROD-anteojos', 'Anteojos de sol Aurora', 45000, 20, false, 'demo'),
    (v_marca_id, 'DEMO-PROD-zapatillas', 'Zapatillas Orbit', 160000, 2, false, 'demo'),
    (v_marca_id, 'DEMO-PROD-buzo', 'Buzo Cometa', 70000, 20, false, 'demo'),
    (v_marca_id, 'DEMO-PROD-medias', 'Medias Lunares', 12000, 20, false, 'demo'),
    (v_marca_id, 'DEMO-PROD-jean', 'Jean Eclipse', 95000, 20, true, 'demo'),
    (v_marca_id, 'DEMO-PROD-vestido', 'Vestido Marea', 88000, 20, false, 'demo'),
    (v_marca_id, 'DEMO-PROD-remera', 'Remera Polar', 52000, 20, false, 'demo');

  -- Casos actuales (horas desde el abandono)
  for r in
    select * from (values
      ('lucia', 'Lucía Gómez', 'campera', 4.0, true),
      ('diego', 'Diego Sosa', 'buzo', 4.0, true),
      ('valentina', 'Valentina Ríos', 'medias', 4.0, true),
      ('tomas', 'Tomás Vega', 'jean', 4.0, true),
      ('camila', 'Camila Sol', 'remera', 0.5, true)
    ) as t(codigo, nombre, producto, horas, consiente)
  loop
    insert into public.clientes (marca_id, identificador_externo, nombre_visible, consentimiento_estado, consentimiento_fecha, origen)
    values (v_marca_id, 'DEMO-CLI-' || r.codigo, r.nombre, case when r.consiente then 'otorgado' else 'desconocido' end,
      case when r.consiente then v_ahora - interval '60 days' end, 'demo')
    returning id into v_cliente_id;
    v_creado := v_ahora - make_interval(secs => r.horas * 3600);
    insert into public.carritos (marca_id, cliente_id, identificador_externo, creado_en, detectado_en, total, estado, origen)
    select v_marca_id, v_cliente_id, 'DEMO-CASE-' || r.codigo, v_creado, v_creado + interval '1 minute', pr.precio_actual, 'detectado', 'demo'
    from public.productos pr where pr.marca_id = v_marca_id and pr.identificador_externo = 'DEMO-PROD-' || r.producto
    returning id into v_carrito_id;
    insert into public.items_carrito (carrito_id, producto_id, identificador_producto_externo, nombre_producto, cantidad, precio_unitario)
    select v_carrito_id, pr.id, pr.identificador_externo, pr.nombre, 1, pr.precio_actual
    from public.productos pr where pr.marca_id = v_marca_id and pr.identificador_externo = 'DEMO-PROD-' || r.producto;
  end loop;

  -- Historial de 4 semanas para Resumen y el reporte
  for r in
    select * from (values
      ('h01', 'Julieta Mena', null, 'campera', 27, 'descuento', 10, true),
      ('h02', 'Bruno Díaz', null, 'buzo', 25, 'descuento', 5, false),
      ('h03', 'Carla Ibarra', null, 'jean', 22, 'envio_gratis', null, true),
      ('h04', 'Nicolás Ferro', null, 'zapatillas', 20, 'bloquear:stock', null, false),
      ('h05', 'Lara Quiroga', null, 'vestido', 18, 'bloquear:consentimiento', null, false),
      ('h06', 'Pedro Alonso', null, 'medias', 15, 'recordatorio', null, true),
      ('h07', 'Mía Torres', null, 'campera', 12, 'descuento', 10, true),
      ('h08', 'Iván Soto', null, 'remera', 10, 'descuento', 5, true),
      ('h09', 'Rocío Paz', null, 'anteojos', 8, 'descartar', null, false),
      ('h10', 'Emilia Ruiz', null, 'buzo', 6, 'descuento', 5, false),
      ('h11', 'Diego Sosa', 'diego', 'buzo', 3, 'descuento', 5, false)
    ) as t(codigo, nombre, cliente_existente, producto, dias, decision, porcentaje, recuperado)
  loop
    if r.cliente_existente is not null then
      select id into v_cliente_id from public.clientes where marca_id = v_marca_id and identificador_externo = 'DEMO-CLI-' || r.cliente_existente;
    else
      insert into public.clientes (marca_id, identificador_externo, nombre_visible, consentimiento_estado, consentimiento_fecha, origen)
      values (v_marca_id, 'DEMO-CLI-' || r.codigo, r.nombre, case when r.decision = 'bloquear:consentimiento' then 'desconocido' else 'otorgado' end,
        case when r.decision <> 'bloquear:consentimiento' then v_ahora - interval '90 days' end, 'demo')
      returning id into v_cliente_id;
    end if;
    v_creado := v_ahora - make_interval(days => r.dias) - interval '2 hours';
    insert into public.carritos (marca_id, cliente_id, identificador_externo, creado_en, detectado_en, total, estado, origen)
    select v_marca_id, v_cliente_id, 'DEMO-HIST-' || r.codigo, v_creado, v_creado + interval '1 minute', pr.precio_actual,
      case when r.recuperado then 'recuperado' when r.decision like 'bloquear%' then 'bloqueado' when r.decision = 'descartar' then 'descartado' else 'vencido' end, 'demo'
    from public.productos pr where pr.marca_id = v_marca_id and pr.identificador_externo = 'DEMO-PROD-' || r.producto
    returning id into v_carrito_id;
    insert into public.items_carrito (carrito_id, producto_id, identificador_producto_externo, nombre_producto, cantidad, precio_unitario)
    select v_carrito_id, pr.id, pr.identificador_externo, pr.nombre, 1, pr.precio_actual
    from public.productos pr where pr.marca_id = v_marca_id and pr.identificador_externo = 'DEMO-PROD-' || r.producto;

    insert into public.evaluaciones (carrito_id, politica_id, evaluado_en, resultado, motivo, controles_realizados, decision, regla_bloqueante)
    values (v_carrito_id, v_politica_id, v_creado + interval '2 hours',
      case when r.decision like 'bloquear%' or r.decision = 'descartar' then 'bloqueado' else 'elegible' end,
      case r.decision
        when 'bloquear:stock' then 'Hay poco stock: no conviene incentivar este producto.'
        when 'bloquear:consentimiento' then 'Sin consentimiento del cliente no se envía ningún mensaje.'
        when 'descartar' then 'El cliente completó la compra sin ayuda: no hace falta un incentivo.'
        else 'Promoción ofrecida dentro de las reglas.' end,
      '[]'::jsonb,
      case when r.decision like 'bloquear%' then 'bloquear' else r.decision end,
      case r.decision when 'bloquear:stock' then 'stock' when 'bloquear:consentimiento' then 'consentimiento' when 'descartar' then 'compra' end)
    returning id into v_eval_id;

    if r.decision = 'descartar' then
      insert into public.pedidos (marca_id, cliente_id, identificador_externo, comprado_en, subtotal, descuento, total, estado, origen)
      select v_marca_id, v_cliente_id, 'DEMO-ORDER-' || r.codigo, v_creado + interval '5 hours', ca.total, 0, ca.total, 'pagado', 'demo'
      from public.carritos ca where ca.id = v_carrito_id;
    elsif r.decision in ('descuento', 'envio_gratis', 'recordatorio') then
      select round(ca.total * (1 - coalesce(r.porcentaje, 0)::numeric / 100)) into v_final from public.carritos ca where ca.id = v_carrito_id;
      insert into public.promociones (evaluacion_id, tipo, porcentaje, detalles, explicacion, codigo_cupon, vence_en, estado_cupon, creado_en)
      values (v_eval_id, case r.decision when 'descuento' then 'descuento_porcentaje' when 'envio_gratis' then 'envio_gratis' else 'recordatorio' end,
        r.porcentaje, jsonb_build_object('total_final', v_final), 'Promoción ofrecida dentro de las reglas.',
        case when r.decision <> 'recordatorio' then 'BB-' || upper(r.codigo) end,
        v_creado + interval '50 hours', case when r.recuperado then 'usado' else 'vencido' end, v_creado + interval '2 hours')
      returning id into v_promo_id;
      insert into public.envios (promocion_id, conexion_id, identificador_externo, estado, enviado_en, creado_en)
      values (v_promo_id, v_telegram_id, 'DEMO', 'enviado', v_creado + interval '2 hours', v_creado + interval '2 hours');
      if r.recuperado then
        insert into public.pedidos (marca_id, cliente_id, identificador_externo, comprado_en, subtotal, descuento, total, estado, origen)
        select v_marca_id, v_cliente_id, 'DEMO-ORDER-' || r.codigo, v_creado + interval '20 hours', ca.total, ca.total - v_final, v_final, 'pagado', 'demo'
        from public.carritos ca where ca.id = v_carrito_id
        returning id into v_pedido_id;
        insert into public.atribuciones (promocion_id, pedido_id, resultado, cerrado_en, ventana_horas, monto_recuperado, creado_en)
        values (v_promo_id, v_pedido_id, 'atribuida', v_creado + interval '20 hours', 48, v_final, v_creado + interval '20 hours');
      else
        insert into public.atribuciones (promocion_id, resultado, cerrado_en, ventana_horas, creado_en)
        values (v_promo_id, 'vencida', v_creado + interval '50 hours', 48, v_creado + interval '50 hours');
      end if;
    end if;
  end loop;

  return public.listar_casos_recuperacion();
end;
$$;
