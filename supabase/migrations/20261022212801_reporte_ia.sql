-- Dashboard: un mensaje enviado cuyo plazo terminó sin compra cuenta como vencido (antes solo contaban los del historial).
create or replace function public.resumen_resultados(p_dias integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_marca_id uuid := private.marca_de_usuario();
  v_dias integer := greatest(1, least(coalesce(p_dias, 30), 365));
  v_desde timestamptz := now() - make_interval(days => v_dias);
  v_zona text;
  v_minimo numeric;
  v_umbral numeric;
  v_resultado jsonb;
begin
  if v_marca_id is null then raise exception 'No encontramos tu marca.'; end if;
  select zona_horaria into v_zona from public.marcas where id = v_marca_id;
  select monto_minimo, umbral_escalon into v_minimo, v_umbral from public.politicas_marketing where marca_id = v_marca_id and vigente_hasta is null;
  v_minimo := coalesce(v_minimo, 30000);
  v_umbral := greatest(coalesce(v_umbral, 80000), v_minimo);

  with casos as (
    select ca.id, ca.creado_en, ca.total, cl.nombre_visible as cliente,
      (select string_agg(it.nombre_producto, ', ') from public.items_carrito it where it.carrito_id = ca.id) as producto, ev.decision, ev.regla_bloqueante, pm.tipo, pm.vence_en,
      en.enviado_en, coalesce(en.estado in ('enviado', 'entregado', 'leido', 'clic'), false) as enviado,
      coalesce(atr.resultado = 'atribuida', false) as compro, atr.resultado, coalesce(atr.monto_recuperado, 0) as monto, atr.cerrado_en,
      coalesce(pe.descuento, 0) as descuento
    from public.carritos ca
    left join public.clientes cl on cl.id = ca.cliente_id
    left join public.evaluaciones ev on ev.carrito_id = ca.id
    left join public.promociones pm on pm.evaluacion_id = ev.id
    left join public.envios en on en.promocion_id = pm.id
    left join public.atribuciones atr on atr.promocion_id = pm.id
    left join public.pedidos pe on pe.id = atr.pedido_id
    where ca.marca_id = v_marca_id and ca.creado_en >= v_desde
  ), estados as (
    select *, case
      when compro then 'recuperado'
      when resultado = 'vencida' or (enviado and vence_en < now()) then 'vencido'
      when enviado then 'enviado'
      when decision in ('descuento', 'envio_gratis', 'recordatorio') then 'listo'
      when decision = 'esperar' then 'espera'
      when decision = 'bloquear' then 'bloqueado'
      when decision = 'descartar' then 'compro_solo'
      else 'por_revisar' end as estado
    from casos
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
    'vencidos', (select count(*) from casos where not compro and (resultado = 'vencida' or (enviado and vence_en < now()))),
    'bloqueados', (select count(*) from casos where decision = 'bloquear'),
    'ventas_anterior', (select ventas from anterior),
    'compras_anterior', (select compras from anterior),
    'casos', (select coalesce(jsonb_agg(jsonb_build_object('cliente', cliente, 'producto', producto, 'total', total, 'monto', monto, 'tipo', tipo,
        'estado', estado, 'creado_en', creado_en) order by creado_en desc), '[]'::jsonb)
      from (select * from estados order by creado_en desc limit 60) r),
    'por_tamano', (select jsonb_agg(jsonb_build_object('tramo', tramo, 'desde', desde, 'hasta', hasta, 'carritos', carritos, 'compras', compras) order by orden) from (
      select t.orden, t.tramo, t.desde, t.hasta,
        (select count(*) from casos c where c.total >= t.desde and (t.hasta is null or c.total < t.hasta)) as carritos,
        (select count(*) from casos c where c.compro and c.total >= t.desde and (t.hasta is null or c.total < t.hasta)) as compras
      from (values (1, 'chico', 0::numeric, v_minimo), (2, 'mediano', v_minimo, v_umbral), (3, 'grande', v_umbral, null::numeric)) as t(orden, tramo, desde, hasta)) b),
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
-- Reporte con IA: la app pide un reporte, n8n lo genera con Gemini (plan gratuito) y lo guarda.
-- La base guarda una foto de las métricas al pedirlo: la IA solo interpreta esos números, no calcula ni inventa.
-- La clave de Gemini vive únicamente en n8n. El token de cada pedido es de un solo uso y vence en 10 minutos.
create table if not exists public.reportes_ia (
  id uuid primary key default gen_random_uuid(),
  marca_id uuid not null references public.marcas(id) on delete cascade,
  periodo_dias integer not null check (periodo_dias between 1 and 365),
  metricas jsonb not null,
  contenido jsonb,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'generando', 'listo', 'error')),
  modelo text,
  error text,
  token uuid not null default gen_random_uuid(),
  token_vence_en timestamptz not null default now() + interval '10 minutes',
  creado_en timestamptz not null default now(),
  completado_en timestamptz
);
create index if not exists reportes_ia_marca_idx on public.reportes_ia (marca_id, creado_en desc);

alter table public.reportes_ia enable row level security;
drop policy if exists reportes_ia_leer_propios on public.reportes_ia;
create policy reportes_ia_leer_propios on public.reportes_ia for select to authenticated using (marca_id = private.marca_de_usuario());
revoke all on public.reportes_ia from anon, authenticated;
-- El token no se expone a la app: solo las columnas que se muestran.
grant select (id, marca_id, periodo_dias, contenido, estado, modelo, error, creado_en, completado_en) on public.reportes_ia to authenticated;

-- Instrucciones para la IA, versionadas acá junto con los datos que recibe.
create or replace function private.prompt_reporte_ia(p_marca text, p_dias integer, p_metricas jsonb)
returns text language sql immutable set search_path = '' as $$
  select 'Sos un analista de e-commerce que ayuda a ' || p_marca || ', una marca de indumentaria que vende en Tiendanube, '
    || 'a entender los resultados de BuyerBrain, un servicio que recupera carritos abandonados con mensajes y promociones '
    || 'según reglas que define la marca. Analizá los últimos ' || p_dias || ' días.' || E'\n\n'
    || 'Reglas obligatorias:' || E'\n'
    || '- Usá SOLO los números del JSON. No inventes cifras, porcentajes ni comparaciones que no estén o no se puedan calcular directamente.' || E'\n'
    || '- Escribí en español rioplatense, claro y sin tecnicismos, para una persona que no es analista.' || E'\n'
    || '- "hechos": lo que pasó, cada uno con su número. "hipotesis": posibles causas, redactadas como posibilidad ("puede ser que…"), nunca como certeza. '
    || '"recomendaciones": cambios concretos en las reglas de la marca (espera, monto mínimo, frecuencia, descuento máximo, carrito caro desde, descuento menor, stock mínimo, vencimiento del cupón, tipos de mensaje), '
    || 'mencionando el valor actual y el valor sugerido, dentro de rangos razonables (descuento máximo hasta 20%).' || E'\n'
    || '- Entre 2 y 4 ítems por sección, de una o dos oraciones cada uno. Si hay pocos datos, decilo en "resumen" y sé prudente.' || E'\n'
    || '- "resumen": una sola oración con la conclusión principal.' || E'\n\n'
    || 'Datos (JSON): ' || p_metricas::text;
$$;

create or replace function public.preparar_reporte_ia(p_dias integer default 30)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_marca_id uuid := private.marca_de_usuario();
  v_dias integer := greatest(1, least(coalesce(p_dias, 30), 365));
  v_metricas jsonb;
  v_reglas jsonb;
  v_reporte public.reportes_ia%rowtype;
begin
  if v_marca_id is null then raise exception 'No encontramos tu marca.'; end if;
  perform 1 from public.marcas where id = v_marca_id for update;
  if (select count(*) from public.reportes_ia where marca_id = v_marca_id and creado_en > now() - interval '1 day') >= 10 then
    raise exception 'Llegaste al máximo de 10 reportes por día. Probá de nuevo mañana.';
  end if;
  if exists (select 1 from public.reportes_ia where marca_id = v_marca_id and estado in ('pendiente', 'generando') and creado_en > now() - interval '2 minutes') then
    raise exception 'Ya hay un reporte generándose. Esperá unos segundos.';
  end if;

  select jsonb_build_object('espera_horas', espera_horas, 'monto_minimo', monto_minimo, 'frecuencia_dias', frecuencia_dias, 'descuento_maximo', descuento_maximo,
    'carrito_caro_desde', umbral_escalon, 'descuento_menor', descuento_escalon, 'stock_minimo', stock_minimo, 'vencimiento_cupon_horas', vencimiento_horas,
    'no_combinar_con_ofertas', no_combinar_ofertas, 'mensajes_permitidos', promociones_permitidas)
  into v_reglas from public.politicas_marketing where marca_id = v_marca_id and vigente_hasta is null;
  -- La lista de carritos y la serie diaria no hacen falta para el análisis y agrandan el pedido.
  v_metricas := (public.resumen_resultados(v_dias) - 'casos' - 'serie' - 'desde') || jsonb_build_object('reglas_vigentes', coalesce(v_reglas, '{}'::jsonb));

  insert into public.reportes_ia (marca_id, periodo_dias, metricas) values (v_marca_id, v_dias, v_metricas) returning * into v_reporte;
  return jsonb_build_object('reporte_id', v_reporte.id, 'dispatch_token', v_reporte.token);
end;
$$;

-- Lo llama n8n (con la clave secreta de Supabase): valida el permiso y devuelve el pedido para Gemini.
create or replace function public.tomar_reporte_ia(p_reporte_id uuid, p_dispatch_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_reporte public.reportes_ia%rowtype;
  v_marca text;
begin
  select * into v_reporte from public.reportes_ia where id = p_reporte_id and token = p_dispatch_token and estado = 'pendiente' and token_vence_en > now() for update;
  if v_reporte.id is null then raise exception 'El pedido de reporte no existe, ya se usó o venció.'; end if;
  update public.reportes_ia set estado = 'generando' where id = p_reporte_id;
  select nombre into v_marca from public.marcas where id = v_reporte.marca_id;
  return jsonb_build_object('reporte_id', v_reporte.id, 'prompt', private.prompt_reporte_ia(v_marca, v_reporte.periodo_dias, v_reporte.metricas));
end;
$$;

-- Lo llama n8n con la respuesta de Gemini (o con el error). Solo acepta el formato esperado.
create or replace function public.guardar_reporte_ia(p_reporte_id uuid, p_dispatch_token uuid, p_contenido jsonb default null, p_modelo text default null, p_error text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ok boolean;
begin
  if not exists (select 1 from public.reportes_ia where id = p_reporte_id and token = p_dispatch_token and estado = 'generando' for update) then
    raise exception 'El reporte no está esperando una respuesta.';
  end if;
  v_ok := p_error is null and p_contenido is not null
    and jsonb_typeof(p_contenido -> 'resumen') = 'string'
    and jsonb_typeof(p_contenido -> 'hechos') = 'array'
    and jsonb_typeof(p_contenido -> 'hipotesis') = 'array'
    and jsonb_typeof(p_contenido -> 'recomendaciones') = 'array';
  update public.reportes_ia set
    estado = case when v_ok then 'listo' else 'error' end,
    contenido = case when v_ok then jsonb_build_object('resumen', p_contenido -> 'resumen', 'hechos', p_contenido -> 'hechos',
      'hipotesis', p_contenido -> 'hipotesis', 'recomendaciones', p_contenido -> 'recomendaciones') end,
    modelo = left(p_modelo, 80),
    error = case when v_ok then null else left(coalesce(p_error, 'La IA devolvió un formato inesperado.'), 300) end,
    completado_en = now()
  where id = p_reporte_id;
  return jsonb_build_object('ok', v_ok);
end;
$$;

revoke all on function public.preparar_reporte_ia(integer) from public, anon;
grant execute on function public.preparar_reporte_ia(integer) to authenticated;
revoke all on function public.tomar_reporte_ia(uuid, uuid) from public, anon, authenticated;
revoke all on function public.guardar_reporte_ia(uuid, uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.tomar_reporte_ia(uuid, uuid) to service_role;
grant execute on function public.guardar_reporte_ia(uuid, uuid, jsonb, text, text) to service_role;
