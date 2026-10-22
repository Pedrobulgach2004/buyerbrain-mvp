-- Dashboard: suma la comparación con el período anterior y las últimas ventas recuperadas.
-- Sigue siendo una función de solo lectura; reemplaza la versión anterior sin tocar datos.
create or replace function public.resumen_resultados(p_dias integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_marca_id uuid := private.marca_de_usuario();
  v_dias integer := greatest(1, least(coalesce(p_dias, 30), 365));
  v_desde timestamptz := now() - make_interval(days => v_dias);
  v_zona text;
  v_resultado jsonb;
begin
  if v_marca_id is null then raise exception 'No encontramos tu marca.'; end if;
  select zona_horaria into v_zona from public.marcas where id = v_marca_id;

  with casos as (
    select ca.id, ca.creado_en, ca.total, cl.nombre_visible as cliente,
      (select string_agg(it.nombre_producto, ', ') from public.items_carrito it where it.carrito_id = ca.id) as producto, ev.decision, ev.regla_bloqueante, pm.tipo,
      en.enviado_en, coalesce(en.estado in ('enviado', 'entregado', 'leido', 'clic'), false) as enviado,
      atr.resultado = 'atribuida' as compro, coalesce(atr.monto_recuperado, 0) as monto, atr.cerrado_en,
      coalesce(pe.descuento, 0) as descuento
    from public.carritos ca
    left join public.clientes cl on cl.id = ca.cliente_id
    left join public.evaluaciones ev on ev.carrito_id = ca.id
    left join public.promociones pm on pm.evaluacion_id = ev.id
    left join public.envios en on en.promocion_id = pm.id
    left join public.atribuciones atr on atr.promocion_id = pm.id
    left join public.pedidos pe on pe.id = atr.pedido_id
    where ca.marca_id = v_marca_id and ca.creado_en >= v_desde
  ), anterior as (
    select coalesce(sum(atr.monto_recuperado), 0) as ventas, count(*) as compras
    from public.carritos ca
    join public.evaluaciones ev on ev.carrito_id = ca.id
    join public.promociones pm on pm.evaluacion_id = ev.id
    join public.atribuciones atr on atr.promocion_id = pm.id and atr.resultado = 'atribuida'
    where ca.marca_id = v_marca_id and ca.creado_en >= v_desde - make_interval(days => v_dias) and ca.creado_en < v_desde
  ), dias as (
    select generate_series(date_trunc('day', v_desde at time zone v_zona), date_trunc('day', now() at time zone v_zona), interval '1 day')::date as dia
  )
  select jsonb_build_object(
    'dias', v_dias,
    'desde', v_desde,
    'abandonados', (select count(*) from casos),
    'por_revisar', (select count(*) from casos where decision is null),
    'con_mensaje', (select count(*) from casos where enviado),
    'compras', (select count(*) from casos where compro),
    'ventas', (select coalesce(sum(monto), 0) from casos where compro),
    'descuentos', (select coalesce(sum(descuento), 0) from casos where compro),
    'ventas_anterior', (select ventas from anterior),
    'compras_anterior', (select compras from anterior),
    'recientes', (select coalesce(jsonb_agg(jsonb_build_object('cliente', cliente, 'producto', producto, 'monto', monto, 'tipo', tipo, 'cerrado_en', cerrado_en) order by cerrado_en desc), '[]'::jsonb)
      from (select * from casos where compro order by cerrado_en desc limit 5) r),
    'ventas_sin_descuento', (select coalesce(sum(monto), 0) from casos where compro and coalesce(tipo, '') <> 'descuento_porcentaje'),
    'horas_hasta_compra', (select round(avg(extract(epoch from cerrado_en - enviado_en) / 3600)::numeric, 1) from casos where compro and enviado_en is not null),
    'decisiones', (select coalesce(jsonb_object_agg(grupo, cantidad), '{}'::jsonb) from (
      select case when decision in ('descuento', 'envio_gratis', 'recordatorio') then decision else 'sin_mensaje' end as grupo, count(*) as cantidad
      from casos where decision is not null group by 1) d),
    'por_promocion', (select coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'enviados', enviados, 'compras', compras, 'ventas', ventas) order by tipo), '[]'::jsonb) from (
      select tipo, count(*) as enviados, count(*) filter (where compro) as compras, coalesce(sum(monto) filter (where compro), 0) as ventas
      from casos where enviado and tipo is not null group by tipo) p),
    'cuidados', (select coalesce(jsonb_agg(jsonb_build_object('regla', regla_bloqueante, 'cantidad', cantidad) order by cantidad desc), '[]'::jsonb) from (
      select regla_bloqueante, count(*) as cantidad from casos where regla_bloqueante is not null group by regla_bloqueante) c),
    'serie', (select jsonb_agg(jsonb_build_object('dia', di.dia, 'ventas', coalesce(v.ventas, 0)) order by di.dia) from dias di
      left join (select (cerrado_en at time zone v_zona)::date as dia, sum(monto) as ventas from casos where compro group by 1) v on v.dia = di.dia)
  ) into v_resultado;
  return v_resultado;
end;
$$;

revoke all on function public.resumen_resultados(integer) from public, anon;
grant execute on function public.resumen_resultados(integer) to authenticated;
