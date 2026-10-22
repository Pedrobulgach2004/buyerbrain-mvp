-- Promociones muestra los carritos reales todavía sin revisar y calcula la vista previa en la app.
-- Para eso cada caso informa la última promoción del cliente y si compró por su cuenta. Solo agrega campos de lectura.
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
    -- Datos que usa la vista previa de Promociones para decidir igual que private.decidir_recuperacion
    'ultima_promocion_en', (select max(pm2.creado_en) from public.promociones pm2 join public.evaluaciones ev2 on ev2.id = pm2.evaluacion_id join public.carritos c2 on c2.id = ev2.carrito_id
      where c2.cliente_id = ca.cliente_id and c2.id <> ca.id and pm2.creado_en <= now()),
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
      'mensaje', private.mensaje_promocion(pm.tipo, cl.nombre_visible,
        (select string_agg(it.nombre_producto, ', ') from public.items_carrito it where it.carrito_id = ca.id), ca.total, pm.porcentaje, pm.vence_en, ma.zona_horaria)
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
