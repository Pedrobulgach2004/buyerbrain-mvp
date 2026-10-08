begin;

-- Telegram queda fuera de esta etapa del MVP. La compra simulada vuelve a
-- depender únicamente de un checkout elegible y un cupón confirmado.
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
  select c.marca_id into v_marca_id
  from public.cuentas c
  where c.id = (select auth.uid()) and c.estado = 'activa';

  if v_marca_id is null then
    raise exception 'No encontramos una marca activa para esta cuenta.';
  end if;

  perform 1 from public.marcas ma where ma.id = v_marca_id for update;

  select ca.cliente_id, pm.id into v_cliente_id, v_promocion_id
  from public.carritos ca
  join public.evaluaciones ev on ev.carrito_id = ca.id and ev.resultado = 'elegible'
  join public.promociones pm on pm.evaluacion_id = ev.id and pm.estado_cupon in ('confirmado', 'usado')
  where ca.id = p_carrito_id
    and ca.marca_id = v_marca_id
    and ca.identificador_externo = 'DEMO-TN-CHECKOUT-001';

  if v_promocion_id is null then
    raise exception 'Primero procesá la oportunidad y confirmá el cupón.';
  end if;

  insert into public.pedidos (
    marca_id, cliente_id, identificador_externo, comprado_en,
    subtotal, descuento, total, moneda, estado
  ) values (
    v_marca_id, v_cliente_id, 'DEMO-TN-ORDER-001', now(),
    120000, 18000, 102000, 'ARS', 'pagado'
  )
  on conflict (marca_id, identificador_externo) do update set estado = 'pagado'
  returning id into v_pedido_id;

  insert into public.atribuciones (
    promocion_id, pedido_id, resultado, cerrado_en, ventana_horas, monto_recuperado
  ) values (
    v_promocion_id, v_pedido_id, 'atribuida', now(), 48, 102000
  )
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

revoke all on function public.confirmar_compra_demo(uuid) from public, anon;
grant execute on function public.confirmar_compra_demo(uuid) to authenticated;

commit;
