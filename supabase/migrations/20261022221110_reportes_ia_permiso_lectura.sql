-- Reporte con IA: la regla de lectura usaba una función interna que el usuario no puede ejecutar
-- ("permission denied for function marca_de_usuario"). Ahora usa la misma verificación que el resto de las tablas.
drop policy if exists reportes_ia_leer_propios on public.reportes_ia;
create policy reportes_ia_leer_propios on public.reportes_ia for select to authenticated using (private.es_miembro_marca(marca_id));
