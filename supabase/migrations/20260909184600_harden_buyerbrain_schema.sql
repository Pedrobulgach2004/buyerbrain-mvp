begin;

create schema if not exists private;

alter function public.es_miembro_marca(uuid) set schema private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
revoke all on function private.es_miembro_marca(uuid) from public, anon;
grant execute on function private.es_miembro_marca(uuid) to authenticated;

create or replace function private.es_miembro_marca(marca_objetivo uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cuentas
    where id = (select auth.uid())
      and marca_id = marca_objetivo
      and estado = 'activa'
  );
$$;

drop policy if exists marcas_actualizar_admin on public.marcas;
create policy marcas_actualizar_admin on public.marcas
for update to authenticated
using (exists (
  select 1
  from public.cuentas c
  where c.id = (select auth.uid())
    and c.marca_id = marcas.id
    and c.rol = 'administrador'
    and c.estado = 'activa'
))
with check (exists (
  select 1
  from public.cuentas c
  where c.id = (select auth.uid())
    and c.marca_id = marcas.id
    and c.rol = 'administrador'
    and c.estado = 'activa'
));

drop policy if exists cuentas_leer_marca on public.cuentas;
create policy cuentas_leer_marca on public.cuentas
for select to authenticated
using (id = (select auth.uid()) or private.es_miembro_marca(marca_id));

drop policy if exists cuentas_crear_propia on public.cuentas;
create policy cuentas_crear_propia on public.cuentas
for insert to authenticated
with check (id = (select auth.uid()));

drop policy if exists cuentas_actualizar_propia on public.cuentas;
create policy cuentas_actualizar_propia on public.cuentas
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create index envios_conexion_idx on public.envios (conexion_id);
create index evaluaciones_politica_idx on public.evaluaciones (politica_id);
create index incidencias_carrito_idx on public.incidencias (carrito_id);
create index incidencias_conexion_idx on public.incidencias (conexion_id);
create index incidencias_envio_idx on public.incidencias (envio_id);
create index items_carrito_producto_idx on public.items_carrito (producto_id);
create index pedidos_cliente_idx on public.pedidos (cliente_id);

commit;
