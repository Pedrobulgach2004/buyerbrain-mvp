begin;

create extension if not exists pgcrypto;

create table public.marcas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 2 and 120),
  estado text not null default 'prueba' check (estado in ('prueba', 'activa', 'pausada', 'suspendida', 'baja')),
  plan_o_prueba text not null default 'prueba',
  automatizacion_activa boolean not null default false,
  zona_horaria text not null default 'America/Argentina/Buenos_Aires',
  alta_en timestamptz not null default now(),
  baja_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (baja_en is null or baja_en >= alta_en)
);

create table public.cuentas (
  id uuid primary key references auth.users(id) on delete cascade,
  marca_id uuid not null references public.marcas(id) on delete cascade,
  email text not null,
  nombre_visible text not null check (length(btrim(nombre_visible)) between 2 and 120),
  rol text not null default 'administrador' check (rol in ('administrador', 'miembro')),
  estado text not null default 'activa' check (estado in ('invitada', 'activa', 'suspendida')),
  ultimo_acceso timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (marca_id, email)
);

create table public.conexiones (
  id uuid primary key default gen_random_uuid(),
  marca_id uuid not null references public.marcas(id) on delete cascade,
  tipo text not null check (tipo in ('tiendanube', 'whatsapp', 'telegram', 'email', 'otro')),
  identificador_externo text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'conectada', 'error', 'revocada', 'desconectada')),
  permisos text[] not null default '{}',
  conectado_en timestamptz,
  error_en timestamptz,
  ultimo_error text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (marca_id, tipo)
);

comment on table public.conexiones is 'Metadatos de integraciones. Los tokens y secretos se guardan fuera de esta tabla, por ejemplo en Supabase Vault.';

create table public.politicas_marketing (
  id uuid primary key default gen_random_uuid(),
  marca_id uuid not null references public.marcas(id) on delete cascade,
  version integer not null check (version > 0),
  descuento_maximo numeric(5,2) not null default 15 check (descuento_maximo between 0 and 100),
  margen_minimo numeric(5,2) check (margen_minimo between 0 and 100),
  stock_minimo integer not null default 3 check (stock_minimo >= 0),
  frecuencia_dias integer not null default 7 check (frecuencia_dias > 0),
  vencimiento_horas integer not null default 48 check (vencimiento_horas > 0),
  exclusiones jsonb not null default '[]'::jsonb check (jsonb_typeof(exclusiones) = 'array'),
  promociones_permitidas jsonb not null default '[]'::jsonb check (jsonb_typeof(promociones_permitidas) = 'array'),
  vigente_desde timestamptz not null default now(),
  vigente_hasta timestamptz,
  creado_en timestamptz not null default now(),
  unique (marca_id, version),
  check (vigente_hasta is null or vigente_hasta > vigente_desde)
);

create unique index politicas_marketing_una_vigente_idx
  on public.politicas_marketing (marca_id)
  where vigente_hasta is null;

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  marca_id uuid not null references public.marcas(id) on delete cascade,
  identificador_externo text not null,
  nombre_visible text,
  contacto_canal jsonb not null default '{}'::jsonb check (jsonb_typeof(contacto_canal) = 'object'),
  consentimiento_estado text not null default 'desconocido' check (consentimiento_estado in ('desconocido', 'otorgado', 'revocado', 'no_aplica')),
  consentimiento_fecha timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (marca_id, identificador_externo)
);

create table public.productos (
  id uuid primary key default gen_random_uuid(),
  marca_id uuid not null references public.marcas(id) on delete cascade,
  identificador_externo text not null,
  nombre text not null,
  precio_actual numeric(14,2) not null check (precio_actual >= 0),
  stock integer not null default 0 check (stock >= 0),
  moneda char(3) not null default 'ARS',
  estado text not null default 'activo' check (estado in ('activo', 'inactivo', 'eliminado')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (marca_id, identificador_externo)
);

create table public.carritos (
  id uuid primary key default gen_random_uuid(),
  marca_id uuid not null references public.marcas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  identificador_externo text not null,
  creado_en timestamptz not null,
  detectado_en timestamptz not null default now(),
  total numeric(14,2) not null check (total >= 0),
  moneda char(3) not null default 'ARS',
  estado text not null default 'detectado' check (estado in ('detectado', 'elegible', 'bloqueado', 'contactado', 'recuperado', 'vencido', 'descartado')),
  actualizado_en timestamptz not null default now(),
  unique (marca_id, identificador_externo),
  check (detectado_en >= creado_en)
);

create table public.items_carrito (
  id uuid primary key default gen_random_uuid(),
  carrito_id uuid not null references public.carritos(id) on delete cascade,
  producto_id uuid references public.productos(id) on delete set null,
  identificador_producto_externo text,
  nombre_producto text not null,
  cantidad integer not null check (cantidad > 0),
  precio_unitario numeric(14,2) not null check (precio_unitario >= 0),
  subtotal numeric(14,2) generated always as (cantidad * precio_unitario) stored,
  creado_en timestamptz not null default now()
);

create table public.evaluaciones (
  id uuid primary key default gen_random_uuid(),
  carrito_id uuid not null unique references public.carritos(id) on delete cascade,
  politica_id uuid not null references public.politicas_marketing(id) on delete restrict,
  evaluado_en timestamptz not null default now(),
  resultado text not null check (resultado in ('elegible', 'bloqueado', 'grupo_control', 'error')),
  motivo text,
  controles_realizados jsonb not null default '[]'::jsonb check (jsonb_typeof(controles_realizados) = 'array'),
  grupo_control boolean not null default false,
  creado_en timestamptz not null default now(),
  check ((resultado = 'grupo_control') = grupo_control)
);

create table public.promociones (
  id uuid primary key default gen_random_uuid(),
  evaluacion_id uuid not null unique references public.evaluaciones(id) on delete cascade,
  tipo text not null default 'descuento_porcentaje' check (tipo in ('descuento_porcentaje', 'envio_gratis', 'envio_express', 'regalo', 'packaging_premium', 'otro')),
  porcentaje numeric(5,2) check (porcentaje between 0 and 100),
  detalles jsonb not null default '{}'::jsonb check (jsonb_typeof(detalles) = 'object'),
  explicacion text not null,
  codigo_cupon text,
  vence_en timestamptz not null,
  estado_cupon text not null default 'pendiente' check (estado_cupon in ('pendiente', 'creando', 'confirmado', 'fallido', 'usado', 'vencido', 'cancelado')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (tipo <> 'descuento_porcentaje' or porcentaje is not null)
);

create table public.envios (
  id uuid primary key default gen_random_uuid(),
  promocion_id uuid not null unique references public.promociones(id) on delete cascade,
  conexion_id uuid not null references public.conexiones(id) on delete restrict,
  identificador_externo text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviando', 'enviado', 'entregado', 'leido', 'clic', 'fallido', 'cancelado')),
  enviado_en timestamptz,
  actualizado_en timestamptz not null default now(),
  creado_en timestamptz not null default now()
);

create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  marca_id uuid not null references public.marcas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  identificador_externo text not null,
  comprado_en timestamptz not null,
  subtotal numeric(14,2) not null check (subtotal >= 0),
  descuento numeric(14,2) not null default 0 check (descuento >= 0),
  total numeric(14,2) not null check (total >= 0),
  moneda char(3) not null default 'ARS',
  estado text not null check (estado in ('pendiente', 'pagado', 'cancelado', 'reembolsado', 'parcialmente_reembolsado')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (marca_id, identificador_externo),
  check (total <= subtotal)
);

create table public.atribuciones (
  id uuid primary key default gen_random_uuid(),
  promocion_id uuid not null unique references public.promociones(id) on delete cascade,
  pedido_id uuid unique references public.pedidos(id) on delete set null,
  resultado text not null check (resultado in ('pendiente', 'atribuida', 'no_atribuida', 'grupo_control', 'vencida')),
  cerrado_en timestamptz,
  ventana_horas integer not null default 48 check (ventana_horas > 0),
  monto_recuperado numeric(14,2) not null default 0 check (monto_recuperado >= 0),
  creado_en timestamptz not null default now(),
  check ((resultado = 'atribuida' and pedido_id is not null and cerrado_en is not null) or resultado <> 'atribuida')
);

create table public.incidencias (
  id uuid primary key default gen_random_uuid(),
  marca_id uuid not null references public.marcas(id) on delete cascade,
  conexion_id uuid references public.conexiones(id) on delete set null,
  carrito_id uuid references public.carritos(id) on delete set null,
  envio_id uuid references public.envios(id) on delete set null,
  tipo text not null,
  descripcion text not null,
  estado text not null default 'abierta' check (estado in ('abierta', 'en_revision', 'resuelta', 'ignorada')),
  ocurrio_en timestamptz not null default now(),
  resolucion text,
  resuelta_en timestamptz,
  creado_en timestamptz not null default now(),
  check (conexion_id is not null or carrito_id is not null or envio_id is not null),
  check ((estado = 'resuelta' and resolucion is not null and resuelta_en is not null) or estado <> 'resuelta')
);

create index cuentas_marca_idx on public.cuentas (marca_id);
create index conexiones_marca_estado_idx on public.conexiones (marca_id, estado);
create index clientes_marca_consentimiento_idx on public.clientes (marca_id, consentimiento_estado);
create index productos_marca_estado_idx on public.productos (marca_id, estado);
create index carritos_marca_detectado_idx on public.carritos (marca_id, detectado_en desc);
create index carritos_cliente_idx on public.carritos (cliente_id);
create index items_carrito_carrito_idx on public.items_carrito (carrito_id);
create index envios_estado_idx on public.envios (estado, actualizado_en desc);
create index pedidos_marca_comprado_idx on public.pedidos (marca_id, comprado_en desc);
create index incidencias_marca_estado_idx on public.incidencias (marca_id, estado, ocurrio_en desc);

create or replace function public.actualizar_actualizado_en()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

create trigger marcas_actualizado_en before update on public.marcas
for each row execute function public.actualizar_actualizado_en();
create trigger cuentas_actualizado_en before update on public.cuentas
for each row execute function public.actualizar_actualizado_en();
create trigger conexiones_actualizado_en before update on public.conexiones
for each row execute function public.actualizar_actualizado_en();
create trigger clientes_actualizado_en before update on public.clientes
for each row execute function public.actualizar_actualizado_en();
create trigger productos_actualizado_en before update on public.productos
for each row execute function public.actualizar_actualizado_en();
create trigger carritos_actualizado_en before update on public.carritos
for each row execute function public.actualizar_actualizado_en();
create trigger promociones_actualizado_en before update on public.promociones
for each row execute function public.actualizar_actualizado_en();
create trigger envios_actualizado_en before update on public.envios
for each row execute function public.actualizar_actualizado_en();
create trigger pedidos_actualizado_en before update on public.pedidos
for each row execute function public.actualizar_actualizado_en();

create or replace function public.es_miembro_marca(marca_objetivo uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cuentas
    where id = auth.uid()
      and marca_id = marca_objetivo
      and estado = 'activa'
  );
$$;

revoke all on function public.es_miembro_marca(uuid) from public;
grant execute on function public.es_miembro_marca(uuid) to authenticated;

alter table public.marcas enable row level security;
alter table public.cuentas enable row level security;
alter table public.conexiones enable row level security;
alter table public.politicas_marketing enable row level security;
alter table public.clientes enable row level security;
alter table public.productos enable row level security;
alter table public.carritos enable row level security;
alter table public.items_carrito enable row level security;
alter table public.evaluaciones enable row level security;
alter table public.promociones enable row level security;
alter table public.envios enable row level security;
alter table public.pedidos enable row level security;
alter table public.atribuciones enable row level security;
alter table public.incidencias enable row level security;

create policy marcas_insertar_autenticado on public.marcas
for insert to authenticated with check (true);
create policy marcas_de_mi_cuenta on public.marcas
for select to authenticated using (public.es_miembro_marca(id));
create policy marcas_actualizar_admin on public.marcas
for update to authenticated
using (exists (select 1 from public.cuentas c where c.id = auth.uid() and c.marca_id = marcas.id and c.rol = 'administrador' and c.estado = 'activa'))
with check (exists (select 1 from public.cuentas c where c.id = auth.uid() and c.marca_id = marcas.id and c.rol = 'administrador' and c.estado = 'activa'));

create policy cuentas_leer_marca on public.cuentas
for select to authenticated using (id = auth.uid() or public.es_miembro_marca(marca_id));
create policy cuentas_crear_propia on public.cuentas
for insert to authenticated with check (id = auth.uid());
create policy cuentas_actualizar_propia on public.cuentas
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy conexiones_por_marca on public.conexiones
for all to authenticated using (public.es_miembro_marca(marca_id)) with check (public.es_miembro_marca(marca_id));
create policy politicas_por_marca on public.politicas_marketing
for all to authenticated using (public.es_miembro_marca(marca_id)) with check (public.es_miembro_marca(marca_id));
create policy clientes_por_marca on public.clientes
for all to authenticated using (public.es_miembro_marca(marca_id)) with check (public.es_miembro_marca(marca_id));
create policy productos_por_marca on public.productos
for all to authenticated using (public.es_miembro_marca(marca_id)) with check (public.es_miembro_marca(marca_id));
create policy carritos_por_marca on public.carritos
for all to authenticated using (public.es_miembro_marca(marca_id)) with check (public.es_miembro_marca(marca_id));
create policy pedidos_por_marca on public.pedidos
for all to authenticated using (public.es_miembro_marca(marca_id)) with check (public.es_miembro_marca(marca_id));
create policy incidencias_por_marca on public.incidencias
for all to authenticated using (public.es_miembro_marca(marca_id)) with check (public.es_miembro_marca(marca_id));

create policy items_carrito_por_marca on public.items_carrito
for all to authenticated
using (exists (select 1 from public.carritos c where c.id = items_carrito.carrito_id and public.es_miembro_marca(c.marca_id)))
with check (exists (select 1 from public.carritos c where c.id = items_carrito.carrito_id and public.es_miembro_marca(c.marca_id)));

create policy evaluaciones_por_marca on public.evaluaciones
for all to authenticated
using (exists (select 1 from public.carritos c where c.id = evaluaciones.carrito_id and public.es_miembro_marca(c.marca_id)))
with check (exists (select 1 from public.carritos c where c.id = evaluaciones.carrito_id and public.es_miembro_marca(c.marca_id)));

create policy promociones_por_marca on public.promociones
for all to authenticated
using (exists (
  select 1 from public.evaluaciones e
  join public.carritos c on c.id = e.carrito_id
  where e.id = promociones.evaluacion_id and public.es_miembro_marca(c.marca_id)
))
with check (exists (
  select 1 from public.evaluaciones e
  join public.carritos c on c.id = e.carrito_id
  where e.id = promociones.evaluacion_id and public.es_miembro_marca(c.marca_id)
));

create policy envios_por_marca on public.envios
for all to authenticated
using (exists (
  select 1 from public.promociones p
  join public.evaluaciones e on e.id = p.evaluacion_id
  join public.carritos c on c.id = e.carrito_id
  where p.id = envios.promocion_id and public.es_miembro_marca(c.marca_id)
))
with check (exists (
  select 1 from public.promociones p
  join public.evaluaciones e on e.id = p.evaluacion_id
  join public.carritos c on c.id = e.carrito_id
  where p.id = envios.promocion_id and public.es_miembro_marca(c.marca_id)
));

create policy atribuciones_por_marca on public.atribuciones
for all to authenticated
using (exists (
  select 1 from public.promociones p
  join public.evaluaciones e on e.id = p.evaluacion_id
  join public.carritos c on c.id = e.carrito_id
  where p.id = atribuciones.promocion_id and public.es_miembro_marca(c.marca_id)
))
with check (exists (
  select 1 from public.promociones p
  join public.evaluaciones e on e.id = p.evaluacion_id
  join public.carritos c on c.id = e.carrito_id
  where p.id = atribuciones.promocion_id and public.es_miembro_marca(c.marca_id)
));

commit;
