begin;

alter table public.marcas
  add column if not exists plan_inicio_en timestamptz,
  add column if not exists plan_fin_en timestamptz;

alter table public.marcas
  drop constraint if exists marcas_periodo_plan_valido;

alter table public.marcas
  add constraint marcas_periodo_plan_valido
  check (
    (plan_inicio_en is null and plan_fin_en is null)
    or (plan_inicio_en is not null and plan_fin_en is not null and plan_fin_en > plan_inicio_en)
  );

create index if not exists marcas_plan_fin_idx
  on public.marcas (plan_fin_en)
  where plan_fin_en is not null;

commit;
