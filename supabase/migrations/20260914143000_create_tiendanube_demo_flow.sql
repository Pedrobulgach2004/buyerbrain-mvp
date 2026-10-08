begin;

alter table public.marcas
  add column if not exists plan_inicio_en timestamptz,
  add column if not exists plan_fin_en timestamptz;

create or replace function public.obtener_estado_demo_tiendanube()
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

  if v_marca_id is null then
    raise exception 'No encontramos una marca activa para esta cuenta.';
  end if;

  select jsonb_build_object(
    'connection_state', coalesce((select cn.estado from public.conexiones cn where cn.marca_id = v_marca_id and cn.tipo = 'tiendanube'), 'pendiente'),
    'cart_id', ca.id,
    'cart_state', ca.estado,
    'cart_total', ca.total,
    'cart_created_at', ca.creado_en,
    'customer_name', cl.nombre_visible,
    'product_name', it.nombre_producto,
    'product_stock', pr.stock,
    'evaluation_result', ev.resultado,
    'evaluation_reason', ev.motivo,
    'checks', coalesce(ev.controles_realizados, '[]'::jsonb),
    'coupon_code', pm.codigo_cupon,
    'coupon_state', pm.estado_cupon,
    'coupon_percentage', pm.porcentaje,
    'order_total', pe.total,
    'recovered_amount', at.monto_recuperado,
    'attribution_result', at.resultado,
    'plan_ends_at', ma.plan_fin_en
  ) into v_resultado
  from public.marcas ma
  left join public.carritos ca on ca.marca_id = ma.id and ca.identificador_externo = 'DEMO-TN-CHECKOUT-001'
  left join public.clientes cl on cl.id = ca.cliente_id
  left join public.items_carrito it on it.carrito_id = ca.id
  left join public.productos pr on pr.id = it.producto_id
  left join public.evaluaciones ev on ev.carrito_id = ca.id
  left join public.promociones pm on pm.evaluacion_id = ev.id
  left join public.atribuciones at on at.promocion_id = pm.id
  left join public.pedidos pe on pe.id = at.pedido_id
  where ma.id = v_marca_id
  limit 1;

  return coalesce(v_resultado, jsonb_build_object('connection_state', 'pendiente'));
end;
$$;

create or replace function public.iniciar_demo_tiendanube()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marca_id uuid;
  v_cliente_id uuid;
  v_producto_id uuid;
  v_carrito_id uuid;
begin
  select c.marca_id into v_marca_id
  from public.cuentas c
  where c.id = (select auth.uid()) and c.estado = 'activa';

  if v_marca_id is null then
    raise exception 'No encontramos una marca activa para esta cuenta.';
  end if;

  perform 1 from public.marcas ma where ma.id = v_marca_id for update;

  insert into public.conexiones (marca_id, tipo, identificador_externo, estado, permisos, conectado_en)
  values (v_marca_id, 'tiendanube', 'DEMO-TN-STORE-001', 'conectada', array['read_products','read_customers','read_orders','write_coupons'], now())
  on conflict (marca_id, tipo) do update set
    identificador_externo = excluded.identificador_externo,
    estado = 'conectada',
    permisos = excluded.permisos,
    conectado_en = coalesce(public.conexiones.conectado_en, excluded.conectado_en),
    error_en = null,
    ultimo_error = null;

  insert into public.clientes (marca_id, identificador_externo, nombre_visible, contacto_canal, consentimiento_estado)
  values (v_marca_id, 'DEMO-TN-CUSTOMER-001', 'Lucía Gómez', '{}'::jsonb, 'no_aplica')
  on conflict (marca_id, identificador_externo) do update set nombre_visible = excluded.nombre_visible
  returning id into v_cliente_id;

  insert into public.productos (marca_id, identificador_externo, nombre, precio_actual, stock, moneda, estado)
  values (v_marca_id, 'DEMO-TN-PRODUCT-001', 'Campera Nébula', 120000, 12, 'ARS', 'activo')
  on conflict (marca_id, identificador_externo) do update set
    nombre = excluded.nombre,
    precio_actual = excluded.precio_actual,
    stock = excluded.stock,
    estado = 'activo'
  returning id into v_producto_id;

  insert into public.carritos (marca_id, cliente_id, identificador_externo, creado_en, detectado_en, total, moneda, estado)
  values (v_marca_id, v_cliente_id, 'DEMO-TN-CHECKOUT-001', now() - interval '2 hours', now(), 120000, 'ARS', 'detectado')
  on conflict (marca_id, identificador_externo) do update set cliente_id = excluded.cliente_id
  returning id into v_carrito_id;

  if not exists (select 1 from public.items_carrito i where i.carrito_id = v_carrito_id and i.identificador_producto_externo = 'DEMO-TN-PRODUCT-001') then
    insert into public.items_carrito (carrito_id, producto_id, identificador_producto_externo, nombre_producto, cantidad, precio_unitario)
    values (v_carrito_id, v_producto_id, 'DEMO-TN-PRODUCT-001', 'Campera Nébula', 1, 120000);
  end if;

  return public.obtener_estado_demo_tiendanube();
end;
$$;

create or replace function public.guardar_reglas_y_activar_demo(
  p_descuento numeric,
  p_stock integer,
  p_frecuencia integer,
  p_vencimiento integer,
  p_promociones jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marca_id uuid;
  v_politica_id uuid;
  v_inicio timestamptz;
  v_fin timestamptz;
begin
  select c.marca_id into v_marca_id
  from public.cuentas c
  where c.id = (select auth.uid()) and c.estado = 'activa';

  if v_marca_id is null then raise exception 'No encontramos una marca activa para esta cuenta.'; end if;
  perform 1 from public.marcas ma where ma.id = v_marca_id for update;
  if not exists (select 1 from public.conexiones cn where cn.marca_id = v_marca_id and cn.tipo = 'tiendanube' and cn.estado = 'conectada') then
    raise exception 'Primero autorizá la tienda de demostración.';
  end if;
  if p_descuento < 0 or p_descuento > 100 then raise exception 'El descuento debe estar entre 0 y 100.'; end if;
  if p_stock < 0 then raise exception 'El stock mínimo no puede ser negativo.'; end if;
  if p_frecuencia < 1 then raise exception 'La frecuencia debe ser de al menos un día.'; end if;
  if p_vencimiento < 1 then raise exception 'El vencimiento debe ser de al menos una hora.'; end if;
  if jsonb_typeof(p_promociones) <> 'array' then raise exception 'Las promociones permitidas deben ser una lista.'; end if;

  select pm.id into v_politica_id
  from public.politicas_marketing pm
  where pm.marca_id = v_marca_id and pm.vigente_hasta is null
  order by pm.version desc
  limit 1;

  if v_politica_id is null then
    insert into public.politicas_marketing (
      marca_id, version, descuento_maximo, stock_minimo, frecuencia_dias, vencimiento_horas, promociones_permitidas
    ) values (v_marca_id, 1, p_descuento, p_stock, p_frecuencia, p_vencimiento, p_promociones)
    returning id into v_politica_id;
  else
    update public.politicas_marketing set
      descuento_maximo = p_descuento,
      stock_minimo = p_stock,
      frecuencia_dias = p_frecuencia,
      vencimiento_horas = p_vencimiento,
      promociones_permitidas = p_promociones
    where id = v_politica_id;
  end if;

  select
    case when ma.plan_fin_en is null or ma.plan_fin_en <= now() then now() else ma.plan_inicio_en end,
    case when ma.plan_fin_en is null or ma.plan_fin_en <= now() then now() + interval '1 month' else ma.plan_fin_en end
  into v_inicio, v_fin
  from public.marcas ma where ma.id = v_marca_id;

  update public.marcas set
    plan_o_prueba = 'demo-30-dias',
    plan_inicio_en = v_inicio,
    plan_fin_en = v_fin,
    estado = 'activa',
    automatizacion_activa = true
  where id = v_marca_id;

  return jsonb_build_object('policy_id', v_politica_id, 'plan_starts_at', v_inicio, 'plan_ends_at', v_fin);
end;
$$;

create or replace function public.procesar_oportunidad_demo(p_carrito_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marca_id uuid;
  v_politica_id uuid;
  v_evaluacion_id uuid;
  v_descuento numeric;
  v_stock_minimo integer;
  v_vencimiento integer;
  v_stock integer;
  v_elegible boolean;
  v_motivo text;
  v_controles jsonb;
begin
  select c.marca_id into v_marca_id from public.cuentas c where c.id = (select auth.uid()) and c.estado = 'activa';
  if v_marca_id is null then raise exception 'No encontramos una marca activa para esta cuenta.'; end if;
  perform 1 from public.marcas ma where ma.id = v_marca_id for update;
  if not exists (select 1 from public.carritos ca where ca.id = p_carrito_id and ca.marca_id = v_marca_id and ca.identificador_externo = 'DEMO-TN-CHECKOUT-001') then
    raise exception 'El checkout de demostración no pertenece a esta cuenta.';
  end if;
  if not exists (select 1 from public.marcas ma where ma.id = v_marca_id and ma.automatizacion_activa and ma.plan_fin_en > now()) then
    raise exception 'La demo todavía no está activa. Guardá primero las reglas comerciales.';
  end if;

  select pm.id, pm.descuento_maximo, pm.stock_minimo, pm.vencimiento_horas
  into v_politica_id, v_descuento, v_stock_minimo, v_vencimiento
  from public.politicas_marketing pm
  where pm.marca_id = v_marca_id and pm.vigente_hasta is null
  order by pm.version desc limit 1;
  if v_politica_id is null then raise exception 'No hay reglas comerciales activas.'; end if;

  select pr.stock into v_stock
  from public.items_carrito it join public.productos pr on pr.id = it.producto_id
  where it.carrito_id = p_carrito_id limit 1;

  v_elegible := v_stock >= v_stock_minimo and v_descuento >= 15;
  v_motivo := case
    when v_stock < v_stock_minimo then 'El stock disponible no alcanza el mínimo definido.'
    when v_descuento < 15 then 'El descuento máximo debe permitir el cupón demo del 15%.'
    else 'Stock y descuento dentro de las reglas comerciales.'
  end;
  v_controles := jsonb_build_array(
    jsonb_build_object('label','Stock disponible','value',format('%s unidades', v_stock),'passed',v_stock >= v_stock_minimo),
    jsonb_build_object('label','Descuento permitido','value',format('%s%% máximo', v_descuento),'passed',v_descuento >= 15),
    jsonb_build_object('label','Checkout duplicado','value','Sin duplicados','passed',true)
  );

  insert into public.evaluaciones (carrito_id, politica_id, resultado, motivo, controles_realizados)
  values (p_carrito_id, v_politica_id, case when v_elegible then 'elegible' else 'bloqueado' end, v_motivo, v_controles)
  on conflict (carrito_id) do update set
    politica_id = excluded.politica_id,
    evaluado_en = now(),
    resultado = excluded.resultado,
    motivo = excluded.motivo,
    controles_realizados = excluded.controles_realizados
  returning id into v_evaluacion_id;

  update public.carritos set estado = case when v_elegible then 'elegible' else 'bloqueado' end where id = p_carrito_id;

  if v_elegible then
    insert into public.promociones (evaluacion_id, tipo, porcentaje, detalles, explicacion, codigo_cupon, vence_en, estado_cupon)
    values (v_evaluacion_id, 'descuento_porcentaje', 15, jsonb_build_object('source','tiendanube-demo'), 'El checkout cumple stock y el descuento respeta el máximo configurado.', 'BB-DEMO-15', now() + make_interval(hours => v_vencimiento), 'confirmado')
    on conflict (evaluacion_id) do update set
      porcentaje = 15,
      explicacion = excluded.explicacion,
      codigo_cupon = 'BB-DEMO-15',
      vence_en = excluded.vence_en,
      estado_cupon = case when public.promociones.estado_cupon = 'usado' then 'usado' else 'confirmado' end;
  else
    update public.promociones set estado_cupon = 'cancelado' where evaluacion_id = v_evaluacion_id and estado_cupon <> 'usado';
  end if;

  return public.obtener_estado_demo_tiendanube();
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
  where ca.id = p_carrito_id and ca.marca_id = v_marca_id and ca.identificador_externo = 'DEMO-TN-CHECKOUT-001';

  if v_promocion_id is null then raise exception 'Primero procesá la oportunidad y confirmá el cupón.'; end if;

  insert into public.pedidos (marca_id, cliente_id, identificador_externo, comprado_en, subtotal, descuento, total, moneda, estado)
  values (v_marca_id, v_cliente_id, 'DEMO-TN-ORDER-001', now(), 120000, 18000, 102000, 'ARS', 'pagado')
  on conflict (marca_id, identificador_externo) do update set estado = 'pagado'
  returning id into v_pedido_id;

  insert into public.atribuciones (promocion_id, pedido_id, resultado, cerrado_en, ventana_horas, monto_recuperado)
  values (v_promocion_id, v_pedido_id, 'atribuida', now(), 48, 102000)
  on conflict (promocion_id) do update set
    pedido_id = excluded.pedido_id,
    resultado = 'atribuida',
    cerrado_en = coalesce(public.atribuciones.cerrado_en, excluded.cerrado_en),
    monto_recuperado = 102000;

  update public.promociones set estado_cupon = 'usado' where id = v_promocion_id;
  update public.carritos set estado = 'recuperado' where id = p_carrito_id;

  return public.obtener_estado_demo_tiendanube();
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
  update public.conexiones set estado = 'pendiente', conectado_en = null where marca_id = v_marca_id and tipo = 'tiendanube' and identificador_externo = 'DEMO-TN-STORE-001';
  update public.marcas set plan_o_prueba = 'prueba', plan_inicio_en = null, plan_fin_en = null, estado = 'prueba', automatizacion_activa = false where id = v_marca_id;

  return jsonb_build_object('connection_state', 'pendiente', 'reset', true);
end;
$$;

revoke all on function public.obtener_estado_demo_tiendanube() from public, anon;
revoke all on function public.iniciar_demo_tiendanube() from public, anon;
revoke all on function public.guardar_reglas_y_activar_demo(numeric, integer, integer, integer, jsonb) from public, anon;
revoke all on function public.procesar_oportunidad_demo(uuid) from public, anon;
revoke all on function public.confirmar_compra_demo(uuid) from public, anon;
revoke all on function public.reiniciar_demo_tiendanube() from public, anon;

grant execute on function public.obtener_estado_demo_tiendanube() to authenticated;
grant execute on function public.iniciar_demo_tiendanube() to authenticated;
grant execute on function public.guardar_reglas_y_activar_demo(numeric, integer, integer, integer, jsonb) to authenticated;
grant execute on function public.procesar_oportunidad_demo(uuid) to authenticated;
grant execute on function public.confirmar_compra_demo(uuid) to authenticated;
grant execute on function public.reiniciar_demo_tiendanube() to authenticated;

commit;
