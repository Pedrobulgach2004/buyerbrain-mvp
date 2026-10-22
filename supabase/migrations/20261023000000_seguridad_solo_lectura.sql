-- Seguridad: la app ya no escribe directo en las tablas; todo cambio pasa por las funciones controladas
-- (que validan marca, reglas y estados). Así nadie puede inflar sus métricas ni cambiar a qué Telegram llegan los mensajes.
-- No borra ni modifica datos: solo quita permisos de escritura directa y desactiva funciones viejas de la demo de Lucía.

revoke insert, update, delete, truncate on
  public.atribuciones, public.carritos, public.clientes, public.conexiones, public.envios, public.evaluaciones,
  public.incidencias, public.items_carrito, public.pedidos, public.politicas_marketing, public.productos,
  public.promociones, public.telegram_vinculaciones
from authenticated, anon;

-- La marca y la cuenta se crean juntas con crear_marca_y_cuenta (de una sola vez, sin marcas huérfanas).
revoke insert, delete, truncate on public.marcas, public.cuentas from authenticated, anon;
drop policy if exists marcas_insertar_autenticado on public.marcas;
drop policy if exists cuentas_crear_propia on public.cuentas;
-- Se mantienen las actualizaciones por columna ya acotadas: marcas (nombre, zona_horaria) y cuentas (nombre_visible, ultimo_acceso).

-- Funciones de la demo anterior (un solo caso, Lucía): ya no las usa la app.
revoke execute on function public.confirmar_compra_demo(uuid) from authenticated;
revoke execute on function public.desconectar_demo_telegram() from authenticated;
revoke execute on function public.guardar_reglas_y_activar_demo(numeric, integer, integer, integer, jsonb) from authenticated;
revoke execute on function public.iniciar_demo_tiendanube() from authenticated;
revoke execute on function public.obtener_estado_demo_telegram() from authenticated;
revoke execute on function public.obtener_estado_demo_tiendanube() from authenticated;
revoke execute on function public.preparar_envio_demo_telegram(uuid) from authenticated;
revoke execute on function public.procesar_oportunidad_demo(uuid) from authenticated;
revoke execute on function public.reiniciar_demo_tiendanube() from authenticated;

-- El recordatorio también deja una línea en blanco antes del enlace.
create or replace function private.mensaje_cliente(p_promocion_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select private.mensaje_promocion(pm.tipo, cl.nombre_visible, it.productos, ca.total, pm.porcentaje, pm.vence_en, ma.zona_horaria)
    || case when pm.codigo_cupon is not null then E'\n\nTu cupón: ' || pm.codigo_cupon || E'\n' else E'\n\n' end
    || case when pm.tipo = 'recordatorio' then 'Tu carrito te espera acá: ' else 'Terminá tu compra acá: ' end
    || (select valor from private.configuracion where clave = 'url_app') || '/tienda/' || pm.enlace_token
    || E'\n\n' || ma.nombre
  from public.promociones pm
  join public.evaluaciones ev on ev.id = pm.evaluacion_id
  join public.carritos ca on ca.id = ev.carrito_id
  join public.marcas ma on ma.id = ca.marca_id
  join public.clientes cl on cl.id = ca.cliente_id
  cross join lateral (select string_agg(i.nombre_producto, ', ') as productos from public.items_carrito i where i.carrito_id = ca.id) it
  where pm.id = p_promocion_id;
$$;
revoke all on function private.mensaje_cliente(uuid) from public;
