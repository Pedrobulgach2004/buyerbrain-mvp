-- Aplicar reglas a un carrito que todavía está en su tiempo de espera lo pasa a Seguimiento como 'En espera'.
-- Solo amplía los valores permitidos de evaluaciones (no borra ni cambia datos existentes).
alter table public.evaluaciones drop constraint evaluaciones_decision_check;
alter table public.evaluaciones add constraint evaluaciones_decision_check check (decision = any (array['bloquear', 'descartar', 'recordatorio', 'descuento', 'envio_gratis', 'esperar']));
alter table public.evaluaciones drop constraint evaluaciones_resultado_check;
alter table public.evaluaciones add constraint evaluaciones_resultado_check check (resultado = any (array['elegible', 'bloqueado', 'grupo_control', 'error', 'en_espera']));

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

  -- En espera: queda registrado para que el carrito pase a Seguimiento; se vuelve a evaluar cuando termina la espera.
  if v_resultado = 'esperar' then
    insert into public.evaluaciones (carrito_id, politica_id, evaluado_en, resultado, motivo, controles_realizados, decision, regla_bloqueante)
    values (p_carrito_id, v_politica.id, now(), 'en_espera', v_decision ->> 'reason', v_decision -> 'checks', 'esperar', null)
    on conflict (carrito_id) do update set politica_id = excluded.politica_id, evaluado_en = excluded.evaluado_en, resultado = excluded.resultado,
      motivo = excluded.motivo, controles_realizados = excluded.controles_realizados, decision = excluded.decision, regla_bloqueante = null
    returning id into v_evaluacion_id;
    delete from public.promociones where evaluacion_id = v_evaluacion_id;
    update public.carritos set estado = 'detectado' where id = p_carrito_id;
    return private.caso_json(p_carrito_id) || jsonb_build_object('contactar_en', v_decision ->> 'contact_at');
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
