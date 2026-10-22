-- El carrito simulado llega a Reglas de promoción sin revisar: la marca le aplica sus reglas desde ahí.
-- Solo cambia el final de la función (antes lo revisaba enseguida); no toca datos.
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

  -- Abandonó hace un rato: ya pasó el tiempo de espera de tus reglas, así se le puede escribir enseguida.
  v_creado := now() - make_interval(mins => (coalesce(v_espera, 2) * 60)::int + 5 + floor(random() * 40)::int);
  insert into public.carritos (marca_id, cliente_id, identificador_externo, creado_en, detectado_en, total, estado, origen)
  values (v_marca_id, v_cliente_id, 'DEMO-SIM-' || replace(gen_random_uuid()::text, '-', ''), v_creado, v_creado + interval '1 minute', v_producto.precio_actual, 'detectado', 'demo')
  returning id into v_carrito_id;
  insert into public.items_carrito (carrito_id, producto_id, identificador_producto_externo, nombre_producto, cantidad, precio_unitario)
  values (v_carrito_id, v_producto.id, v_producto.identificador_externo, v_producto.nombre, 1, v_producto.precio_actual);

  return private.caso_json(v_carrito_id);
end;
$$;
