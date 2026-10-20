-- Fase 2a · Reglas comerciales v2, motor de decisiones y escenarios de demostración.
-- Es aditiva: las funciones de la demo anterior (Lucía) siguen funcionando hasta que se publique la pantalla nueva.
-- La lógica de private.decidir_recuperacion replica Frontend/src/lib/rules.ts (mismos resultados para los mismos datos).

-- 1. Política comercial: reglas nuevas con valores de ejemplo
alter table public.politicas_marketing
  add column if not exists espera_horas integer not null default 2 check (espera_horas between 0 and 72),
  add column if not exists monto_minimo numeric(14,2) not null default 30000 check (monto_minimo >= 0),
  add column if not exists umbral_escalon numeric(14,2) not null default 80000 check (umbral_escalon >= 0),
  add column if not exists descuento_escalon numeric(5,2) not null default 5 check (descuento_escalon between 0 and 50),
  add column if not exists no_combinar_ofertas boolean not null default true;
alter table public.politicas_marketing alter column descuento_maximo set default 10;
alter table public.politicas_marketing alter column stock_minimo set default 5;
alter table public.politicas_marketing drop constraint if exists politicas_marketing_escalon_menor_al_maximo;
alter table public.politicas_marketing add constraint politicas_marketing_escalon_menor_al_maximo check (descuento_escalon <= descuento_maximo);

-- Las 25 promociones anteriores no eran ejecutables: se reemplazan por los tres tipos que el sistema aplica.
update public.politicas_marketing
set promociones_permitidas = '["recordatorio","descuento","envio_gratis"]'::jsonb
where exists (
  select 1 from jsonb_array_elements_text(promociones_permitidas) p
  where p not in ('recordatorio', 'descuento', 'envio_gratis')
);

-- 2. Separación explícita entre datos de una tienda y datos de demostración
alter table public.clientes add column if not exists origen text not null default 'tienda' check (origen in ('tienda', 'demo'));
alter table public.productos add column if not exists origen text not null default 'tienda' check (origen in ('tienda', 'demo'));
alter table public.carritos add column if not exists origen text not null default 'tienda' check (origen in ('tienda', 'demo'));
alter table public.pedidos add column if not exists origen text not null default 'tienda' check (origen in ('tienda', 'demo'));
update public.clientes set origen = 'demo' where identificador_externo like 'DEMO-%';
update public.productos set origen = 'demo' where identificador_externo like 'DEMO-%';
update public.carritos set origen = 'demo' where identificador_externo like 'DEMO-%';
update public.pedidos set origen = 'demo' where identificador_externo like 'DEMO-%';

alter table public.productos add column if not exists en_oferta boolean not null default false;

-- 3. Promociones y evaluaciones: recordatorio como tipo y la decisión explicada
alter table public.promociones drop constraint if exists promociones_tipo_check;
alter table public.promociones add constraint promociones_tipo_check
  check (tipo in ('descuento_porcentaje', 'envio_gratis', 'envio_express', 'regalo', 'packaging_premium', 'recordatorio', 'otro'));
alter table public.evaluaciones
  add column if not exists decision text check (decision in ('bloquear', 'descartar', 'recordatorio', 'descuento', 'envio_gratis')),
  add column if not exists regla_bloqueante text;

-- 4. Funciones auxiliares
create or replace function private.marca_de_usuario()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_marca_id uuid;
begin
  select c.marca_id into v_marca_id from public.cuentas c where c.id = (select auth.uid()) and c.estado = 'activa';
  if v_marca_id is null then raise exception 'No encontramos una marca activa para esta cuenta.'; end if;
  return v_marca_id;
end;
$$;

create or replace function private.formato_ars(p_valor numeric)
returns text language sql immutable set search_path = '' as $$
  select '$ ' || replace(to_char(round(p_valor), 'FM999,999,999,990'), ',', '.');
$$;

-- Texto que recibe el cliente. Debe coincidir con previewMessage en Frontend/src/lib/rules.ts.
create or replace function private.mensaje_promocion(p_tipo text, p_cliente text, p_producto text, p_total numeric, p_porcentaje numeric, p_vence timestamptz, p_zona text)
returns text language plpgsql stable set search_path = '' as $$
declare
  v_nombre text := split_part(btrim(p_cliente), ' ', 1);
  v_cuando text := to_char(p_vence at time zone p_zona, 'DD/MM') || ' a las ' || to_char(p_vence at time zone p_zona, 'HH24:MI');
begin
  if p_tipo = 'descuento_porcentaje' then
    return format('Hola %s, vimos que dejaste %s en tu carrito. Te damos un %s%% off: pagás %s en lugar de %s. El cupón vence el %s.',
      v_nombre, p_producto, p_porcentaje::int, private.formato_ars(round(p_total * (1 - p_porcentaje / 100))), private.formato_ars(p_total), v_cuando);
  elsif p_tipo = 'envio_gratis' then
    return format('Hola %s, %s te sigue esperando. Si completás la compra, el envío corre por nuestra cuenta. La promoción vence el %s.', v_nombre, p_producto, v_cuando);
  end if;
  return format('Hola %s, guardamos %s en tu carrito por si querés terminar la compra.', v_nombre, p_producto);
end;
$$;

-- 5. Motor de decisiones (réplica de decideRecovery)
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
  select max(pm.creado_en) into v_ultima
  from public.promociones pm
  join public.evaluaciones ev on ev.id = pm.evaluacion_id
  join public.carritos c2 on c2.id = ev.carrito_id
  where c2.cliente_id = v_carrito.cliente_id and c2.id <> v_carrito.id and pm.creado_en <= p_ahora;
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

-- 6. Vista de un caso para la interfaz
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

create or replace function public.listar_casos_recuperacion()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_marca_id uuid := private.marca_de_usuario();
begin
  return coalesce((
    select jsonb_agg(private.caso_json(ca.id) order by ca.creado_en desc)
    from public.carritos ca where ca.marca_id = v_marca_id
  ), '[]'::jsonb);
end;
$$;

-- 7. Evaluar un carrito con la política vigente y dejar la promoción lista (sin enviar)
create or replace function public.evaluar_carrito(p_carrito_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_marca_id uuid := private.marca_de_usuario();
  v_carrito public.carritos%rowtype;
  v_politica public.politicas_marketing%rowtype;
  v_decision jsonb;
  v_resultado text;
  v_evaluacion_id uuid;
begin
  select * into v_carrito from public.carritos where id = p_carrito_id and marca_id = v_marca_id for update;
  if v_carrito.id is null then raise exception 'No encontramos ese carrito en tu marca.'; end if;
  if v_carrito.estado in ('recuperado', 'vencido') or exists (
    select 1 from public.evaluaciones ev join public.promociones pm on pm.evaluacion_id = ev.id join public.envios en on en.promocion_id = pm.id
    where ev.carrito_id = p_carrito_id and en.estado in ('enviando', 'enviado', 'entregado', 'leido', 'clic')
  ) then
    return private.caso_json(p_carrito_id);
  end if;

  select * into v_politica from public.politicas_marketing where marca_id = v_marca_id and vigente_hasta is null;
  if v_politica.id is null then raise exception 'Primero guardá tus reglas comerciales.'; end if;

  v_decision := private.decidir_recuperacion(p_carrito_id, v_politica, now());
  v_resultado := v_decision ->> 'outcome';

  if v_resultado = 'esperar' then
    delete from public.evaluaciones where carrito_id = p_carrito_id;
    update public.carritos set estado = 'detectado' where id = p_carrito_id;
    return private.caso_json(p_carrito_id) || jsonb_build_object('motivo', v_decision ->> 'reason', 'controles', v_decision -> 'checks', 'contactar_en', v_decision ->> 'contact_at');
  end if;

  insert into public.evaluaciones (carrito_id, politica_id, evaluado_en, resultado, motivo, controles_realizados, decision, regla_bloqueante)
  values (p_carrito_id, v_politica.id, now(),
    case when v_resultado in ('recordatorio', 'descuento', 'envio_gratis') then 'elegible' else 'bloqueado' end,
    v_decision ->> 'reason', v_decision -> 'checks', v_resultado, v_decision ->> 'regla')
  on conflict (carrito_id) do update set politica_id = excluded.politica_id, evaluado_en = excluded.evaluado_en, resultado = excluded.resultado,
    motivo = excluded.motivo, controles_realizados = excluded.controles_realizados, decision = excluded.decision, regla_bloqueante = excluded.regla_bloqueante
  returning id into v_evaluacion_id;

  if v_resultado in ('recordatorio', 'descuento', 'envio_gratis') then
    insert into public.promociones (evaluacion_id, tipo, porcentaje, detalles, explicacion, codigo_cupon, vence_en, estado_cupon)
    values (v_evaluacion_id,
      case v_resultado when 'descuento' then 'descuento_porcentaje' when 'envio_gratis' then 'envio_gratis' else 'recordatorio' end,
      case when v_resultado = 'descuento' then (v_decision ->> 'discount')::numeric end,
      jsonb_build_object('total_final', coalesce((v_decision ->> 'final_total')::numeric, v_carrito.total)),
      v_decision ->> 'reason',
      case when v_resultado = 'recordatorio' then null else 'BB-' || upper(substr(replace(p_carrito_id::text, '-', ''), 1, 6)) end,
      (v_decision ->> 'expires_at')::timestamptz, 'confirmado')
    on conflict (evaluacion_id) do update set tipo = excluded.tipo, porcentaje = excluded.porcentaje, detalles = excluded.detalles,
      explicacion = excluded.explicacion, codigo_cupon = excluded.codigo_cupon, vence_en = excluded.vence_en, estado_cupon = excluded.estado_cupon;
  else
    delete from public.promociones where evaluacion_id = v_evaluacion_id;
  end if;

  update public.carritos
  set estado = case v_resultado when 'bloquear' then 'bloqueado' when 'descartar' then 'descartado' else 'elegible' end
  where id = p_carrito_id;
  return private.caso_json(p_carrito_id);
end;
$$;

create or replace function public.evaluar_casos_pendientes()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_marca_id uuid := private.marca_de_usuario();
  v_id uuid;
begin
  for v_id in
    select ca.id from public.carritos ca
    where ca.marca_id = v_marca_id and ca.estado in ('detectado', 'elegible', 'bloqueado', 'descartado')
      and ca.identificador_externo not like 'DEMO-HIST-%'
  loop
    perform public.evaluar_carrito(v_id);
  end loop;
  return public.listar_casos_recuperacion();
end;
$$;

-- 8. Guardar reglas como una versión nueva (la anterior queda como historial)
create or replace function public.guardar_politica(p_reglas jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_marca_id uuid := private.marca_de_usuario();
  v_actual public.politicas_marketing%rowtype;
  v_nueva public.politicas_marketing%rowtype;
  v_promos jsonb := coalesce(p_reglas -> 'promociones_permitidas', '[]'::jsonb);
  v_campo text;
begin
  foreach v_campo in array array['espera_horas', 'monto_minimo', 'frecuencia_dias', 'descuento_maximo', 'umbral_escalon', 'descuento_escalon', 'stock_minimo', 'vencimiento_horas'] loop
    if coalesce(jsonb_typeof(p_reglas -> v_campo), '') <> 'number' or (p_reglas ->> v_campo)::numeric <> trunc((p_reglas ->> v_campo)::numeric) then
      raise exception 'El valor de % debe ser un número entero.', v_campo;
    end if;
  end loop;
  if coalesce(jsonb_typeof(p_reglas -> 'no_combinar_ofertas'), '') <> 'boolean' then raise exception 'Falta indicar si el descuento se combina con ofertas.'; end if;
  if jsonb_typeof(v_promos) <> 'array' or jsonb_array_length(v_promos) = 0 then raise exception 'Elegí al menos un tipo de promoción.'; end if;
  if exists (select 1 from jsonb_array_elements_text(v_promos) p where p not in ('recordatorio', 'descuento', 'envio_gratis')) then
    raise exception 'Hay un tipo de promoción no válido.';
  end if;
  if (p_reglas ->> 'descuento_maximo')::numeric > 50 or (p_reglas ->> 'frecuencia_dias')::int not between 1 and 90
    or (p_reglas ->> 'vencimiento_horas')::int not between 1 and 168 or (p_reglas ->> 'espera_horas')::int not between 0 and 72 then
    raise exception 'Algún valor está fuera del rango permitido.';
  end if;

  perform 1 from public.marcas where id = v_marca_id for update;
  select * into v_actual from public.politicas_marketing where marca_id = v_marca_id and vigente_hasta is null;
  if v_actual.id is not null then
    update public.politicas_marketing set vigente_hasta = now() where id = v_actual.id;
  end if;

  insert into public.politicas_marketing (marca_id, version, descuento_maximo, stock_minimo, frecuencia_dias, vencimiento_horas,
    espera_horas, monto_minimo, umbral_escalon, descuento_escalon, no_combinar_ofertas, promociones_permitidas, vigente_desde)
  values (v_marca_id, coalesce(v_actual.version, 0) + 1,
    (p_reglas ->> 'descuento_maximo')::numeric, (p_reglas ->> 'stock_minimo')::int, (p_reglas ->> 'frecuencia_dias')::int,
    (p_reglas ->> 'vencimiento_horas')::int, (p_reglas ->> 'espera_horas')::int, (p_reglas ->> 'monto_minimo')::numeric,
    (p_reglas ->> 'umbral_escalon')::numeric, (p_reglas ->> 'descuento_escalon')::numeric, (p_reglas ->> 'no_combinar_ofertas')::boolean,
    v_promos, now())
  returning * into v_nueva;
  return to_jsonb(v_nueva);
end;
$$;

-- 9. Activación de la demo como paso separado de guardar reglas
create or replace function public.activar_demo_30_dias()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_marca_id uuid := private.marca_de_usuario();
begin
  if not exists (select 1 from public.politicas_marketing where marca_id = v_marca_id and vigente_hasta is null) then
    raise exception 'Guardá tus reglas comerciales antes de activar la demo.';
  end if;
  update public.marcas set plan_o_prueba = 'demo-30-dias', plan_inicio_en = now(), plan_fin_en = now() + interval '1 month', automatizacion_activa = true
  where id = v_marca_id;
  return jsonb_build_object('plan', 'demo-30-dias', 'vence_en', now() + interval '1 month');
end;
$$;

-- 10. Escenarios de demostración: 9 casos actuales y un historial de 4 semanas.
-- Solo borra y recrea datos con origen 'demo' de la marca del usuario. Debe coincidir con Frontend/src/lib/demoCases.ts.
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
      ('martin', 'Martín Ruiz', 'anteojos', 4.0, true),
      ('sofia', 'Sofía Paz', 'zapatillas', 4.0, true),
      ('diego', 'Diego Sosa', 'buzo', 4.0, true),
      ('valentina', 'Valentina Ríos', 'medias', 4.0, true),
      ('tomas', 'Tomás Vega', 'jean', 4.0, true),
      ('paula', 'Paula Luna', 'vestido', 4.0, false),
      ('camila', 'Camila Sol', 'remera', 0.5, true),
      ('ana', 'Ana Prado', 'campera', 4.0, true)
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
    if r.codigo = 'ana' then
      insert into public.pedidos (marca_id, cliente_id, identificador_externo, comprado_en, subtotal, descuento, total, estado, origen)
      values (v_marca_id, v_cliente_id, 'DEMO-ORDER-ana', v_ahora - interval '1 hour', 120000, 0, 120000, 'pagado', 'demo');
    end if;
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

-- 11. Permisos
revoke all on function private.marca_de_usuario() from public, anon, authenticated;
revoke all on function private.formato_ars(numeric) from public, anon, authenticated;
revoke all on function private.mensaje_promocion(text, text, text, numeric, numeric, timestamptz, text) from public, anon, authenticated;
revoke all on function private.decidir_recuperacion(uuid, public.politicas_marketing, timestamptz) from public, anon, authenticated;
revoke all on function private.caso_json(uuid) from public, anon, authenticated;
revoke all on function public.listar_casos_recuperacion() from public, anon;
revoke all on function public.evaluar_carrito(uuid) from public, anon;
revoke all on function public.evaluar_casos_pendientes() from public, anon;
revoke all on function public.guardar_politica(jsonb) from public, anon;
revoke all on function public.activar_demo_30_dias() from public, anon;
revoke all on function public.cargar_escenarios_demo() from public, anon;
grant execute on function public.listar_casos_recuperacion() to authenticated;
grant execute on function public.evaluar_carrito(uuid) to authenticated;
grant execute on function public.evaluar_casos_pendientes() to authenticated;
grant execute on function public.guardar_politica(jsonb) to authenticated;
grant execute on function public.activar_demo_30_dias() to authenticated;
grant execute on function public.cargar_escenarios_demo() to authenticated;
