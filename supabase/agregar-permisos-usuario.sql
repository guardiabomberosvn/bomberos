-- NUEVO: apartado "Administración" — permisos por usuario, no solo por rol.
--
-- Agrega una columna a profiles donde el administrador puede guardar,
-- persona por persona, a qué secciones del sistema tiene acceso.
--
-- allowed_sections = null      -> sigue usando el comportamiento de siempre
--                                  según su rol (no cambia nada para nadie
--                                  que todavía no se haya personalizado).
-- allowed_sections = ARRAY[..] -> lista exacta de secciones habilitadas
--                                  para esa persona (ver lib/permissions.ts
--                                  para la lista de códigos válidos, ej:
--                                  'flota', 'combustible', 'stock', etc).
--
-- No hace falta tocar policies: la política "profiles_update_self_or_admin"
-- ya deja que un admin actualice cualquier perfil de su organización.
--
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

alter table public.profiles add column if not exists allowed_sections text[];

notify pgrst, 'reload schema';
