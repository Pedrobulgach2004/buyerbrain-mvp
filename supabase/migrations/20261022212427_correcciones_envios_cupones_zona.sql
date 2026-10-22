-- Correcciones antes del Demo Day. No borra ni cambia datos existentes.
-- 1. Un envío que n8n está procesando no se puede volver a disparar (evita mensajes duplicados).
-- 2. El plazo del cupón empieza a correr cuando se envía el mensaje, no cuando se revisó el carrito.
-- 3. Un cupón vencido antes de enviarse pide revisar el carrito de nuevo.
-- 4. La zona horaria de la marca tiene que ser una zona válida (si no, fallan las fechas de toda la app).

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

create or replace function private.validar_zona_horaria()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.zona_horaria := btrim(new.zona_horaria);
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.zona_horaria) then
    raise exception 'La zona horaria "%" no es válida. Elegí una de la lista.', new.zona_horaria;
  end if;
  return new;
end;
$$;

drop trigger if exists marcas_validar_zona_horaria on public.marcas;
create trigger marcas_validar_zona_horaria before insert or update of zona_horaria on public.marcas
for each row execute function private.validar_zona_horaria();
