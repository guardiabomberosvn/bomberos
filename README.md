# Sistema Bomberos V1

Versión inicial para probar el sistema desde **GitHub + Vercel + Supabase**.

## Qué incluye

- Login con Supabase Auth y recuperación de contraseña por email.
- Primer usuario registrado = **Administrador**.
- Roles: Administrador, Guardia y Bombero.
- Listado y **edición completa** de personal (nombre, legajo, rango, teléfono, rol, estado activo — solo admin).
- Estado Disponible / No disponible.
- Registro de ingreso y salida del cuartel (cada bombero fichándose a sí mismo).
- Admin/guardia pueden marcar ingreso o salida de otra persona manualmente.
- Vista de **asistencia de todo el personal**, filtrable por persona y rango de fechas (solo admin/guardia).
- Bloqueo de doble ingreso abierto por bombero.
- Dashboard con personal activo, disponibles y presentes.
- Actualización Realtime de disponibilidad y asistencia.
- Diseño responsive para PC y celular.
- PWA básica mediante `manifest.webmanifest`.
- Base preparada con `organization_id` para crecer a multi-cuartel.
- **Emergencias (botones configurables)**: el admin crea botones a medida (nombre, código, ícono, color) desde "⚙ Configurar botones" en Emergencias. Al tocar un botón, admin/guardia arman la alerta: ubicación (texto libre, opcional), mensaje para el personal (opcional) y a quién convocar — todo el cuerpo, uno o varios **grupos**, o personas puntuales. El personal convocado la ve en tiempo real y responde ACUDO / NO ACUDO. Se puede finalizar o cancelar con motivo.
- **Grupos de convocatoria**: el admin arma grupos de bomberos (ej. la guardia de la semana) y agrega/saca integrantes libremente. Se usan como destinatarios al accionar una alarma.
- **Motivos de asistencia con puntaje**: al marcar ingreso (manual admin/guardia, por QR, o cuando admin lo marca por otro) hay que elegir un motivo — Guardia, Emergencia, Capacitación, Prevención, Reunión vienen precargados, y el admin puede agregar/editar/desactivar los que quiera desde "Motivos", incluyendo el puntaje de cada uno. Cada bombero ve en "Mi asistencia" su resumen del mes: horas totales, puntos totales, y el desglose por motivo.
- **El bombero usa solo QR**: en el celular, un bombero no tiene botón manual de marcar ingreso/salida — solo puede hacerlo escaneando el QR de consola. Admin y guardia sí conservan el marcado manual para sí mismos.
- **Carga y edición retroactiva de asistencia (solo admin)**: desde "Asistencia (todos)" el admin puede cargar un registro completo (entrada y salida con fecha/hora elegidas a mano) para alguien que se olvidó de marcar, cerrar una asistencia que quedó abierta, o editar cualquier registro existente (motivo, ingreso, salida).
- **Gestión de asistencia de terceros restringida a Admin**: crear o cerrar asistencia de otra persona ya no lo puede hacer guardia, solo administrador (guardia conserva su propia asistencia y todo lo operativo del Libro de Guardia).
- **Exportar a Excel**: desde "Asistencia (todos)", "Emergencias" (historial) y "Libro de Guardia → Llamadas" hay un botón para descargar los registros filtrados en un archivo .xlsx.
- **Libro de Guardia**: módulo con cuatro secciones para admin/guardia — Llamadas (quién llamó, motivo, derivación, cierre), Proveedores y visitas (con vista de quién está dentro del cuartel ahora), Movimientos de vehículos (motivo, chofer, km y horarios de salida/regreso) y Agenda (eventos próximos y pasados).
- **Intervenciones**: registro por servicio (fecha/hora, personal a cargo, operador, observaciones) con posibilidad de sumar una o varias unidades participantes (vehículo + chofer).
- **Flota**: alta de unidades (admin), estado (disponible/servicio/mantenimiento/fuera de servicio), kilometraje editable, historial de movimientos por unidad.
- **Combustible**: registro de cargas por vehículo con litros, km y costo; resumen del mes.
- **Mantenimiento**: órdenes preventivas/correctivas/de inspección con semáforo automático de alerta (🟢 en término / 🟡 próximo / 🟠 muy próximo / 🔴 vencido / ✅ completado) calculado por fecha objetivo y/o kilometraje objetivo contra el km actual del vehículo. El Dashboard muestra un aviso destacado cuando hay alertas vencidas o muy próximas.
- **Hallazgos de mantenimiento**: cualquier bombero puede reportar un problema (unidad/equipo, área afectada, descripción, prioridad, foto opcional) desde el celular. Admin/guardia lo ven y pueden convertirlo directamente en una orden de mantenimiento.
- **Alertas por Telegram**: cada usuario puede vincular su cuenta de Telegram desde "Mi cuenta → Alertas por Telegram". Al accionar una alarma, quienes la tengan vinculada reciben el aviso directo en Telegram, incluso con la app cerrada. Requiere crear un bot gratuito con @BotFather (instrucciones más abajo).
- **Sirena en pantalla**: mientras hay una emergencia activa, aparece un botón flotante para activar una sirena sonora en loop (útil para la consola del cuartel o el celular de guardia con la app abierta).
- **QR de asistencia**: la consola (admin/guardia) muestra un código QR que se renueva solo cada 45 segundos. Cada bombero lo escanea con la cámara de su celular desde "Escanear QR" — el primer escaneo marca ingreso, el segundo marca salida. La consola muestra en vivo quién fue marcando.

## 1. Crear el proyecto de Supabase

1. Crear un proyecto en [supabase.com](https://supabase.com).
2. Ir a **SQL Editor**.
3. Copiar todo el contenido de `supabase/schema.sql`.
4. Ejecutarlo una sola vez.

El SQL crea un cuartel inicial llamado **Cuartel Demo**. Después cambiamos su nombre desde SQL o desde un futuro módulo de configuración.

## 2. Obtener las variables

En Supabase ir a **Project Settings > API** y copiar:

- Project URL.
- Publishable key (o `anon` key en proyectos que todavía muestran el nombre anterior).

Crear `.env.local` en la raíz (podés copiar `.env.example` como base):

```env
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=TU-PUBLISHABLE-KEY
```

## 3. Ejecutar localmente

Requiere Node.js 22 o superior.

```bash
npm install
npm run dev
```

Abrir `http://localhost:3000`.

## 4. Crear el primer usuario

En la pantalla de ingreso tocar **"¿Primera instalación? Crear usuario"**.

El primer usuario que se registre queda automáticamente como **Administrador**. Los siguientes ingresan como **Bombero** y el administrador puede cambiarles el rol desde `Personal`.

### Si Supabase exige confirmar email

Para una prueba rápida podés desactivar temporalmente **Confirm email** en **Authentication > Providers > Email**. Si preferís mantener la confirmación, configurá el **Site URL** y las **Redirect URLs** de Supabase con tu URL local/Vercel.

### Recuperar contraseña

El link "¿Olvidaste tu contraseña?" en el login manda un correo con un link que redirige a `/restablecer`. Para que funcione, esa URL debe estar agregada en Supabase, en **Authentication > URL Configuration > Redirect URLs**:
- Local: `http://localhost:3000/restablecer`
- Producción: `https://TU-DOMINIO.vercel.app/restablecer`

## 5. Subir a GitHub

Desde la carpeta del proyecto:

```bash
git init
git add .
git commit -m "V1 sistema bomberos"
git branch -M main
git remote add origin URL_DE_TU_REPOSITORIO
git push -u origin main
```

## 6. Publicar en Vercel

1. Importar el repositorio de GitHub en Vercel.
2. Vercel detectará Next.js automáticamente.
3. En **Environment Variables** agregar:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
4. Deploy.

A partir de ahí, cada `git push` a la rama conectada genera un nuevo deployment.

## Si ya tenías el sistema funcionando y solo agregás módulos nuevos

No hace falta re-ejecutar `schema.sql` completo. Andá a Supabase → SQL Editor → New query, pegá el contenido del archivo correspondiente y ejecutalo una vez (son seguros de re-ejecutar, usan `if not exists`):

- `supabase/agregar-emergencias.sql` — módulo de Emergencias (base).
- `supabase/agregar-qr-asistencia.sql` — QR de asistencia por consola.
- `supabase/agregar-tipos-emergencia-grupos.sql` — botones configurables de emergencia + grupos de convocatoria.
- `supabase/agregar-motivos-asistencia.sql` — motivos de asistencia con puntaje.
- `supabase/agregar-asistencia-admin.sql` — restringe gestión de asistencia de terceros a Admin.
- `supabase/agregar-libro-guardia.sql` — Libro de Guardia (llamadas, visitas, vehículos, movimientos, agenda).
- `supabase/agregar-flota-mantenimiento.sql` — estado/km de vehículos, combustible, mantenimiento.
- `supabase/agregar-intervenciones.sql` — intervenciones y unidades participantes.
- `supabase/agregar-hallazgos-mantenimiento.sql` — hallazgos con foto (crea también el bucket de almacenamiento).
- `supabase/agregar-telegram.sql` — columna para vincular Telegram en el perfil.
- `supabase/agregar-convocatoria.sql` — emergencias con/sin convocatoria.

## Configurar el bot de Telegram (opcional, gratis)

1. Abrí Telegram, buscá **@BotFather** y enviale `/newbot`.
2. Elegí un nombre para mostrar y un nombre de usuario que termine en "bot" (ej: `BomberosVillaNuevaBot`).
3. BotFather te devuelve un **token** (algo como `123456789:ABCdef...`). Copialo.
4. En tu `.env.local`, completá:
   ```env
   NEXT_PUBLIC_TELEGRAM_BOT_TOKEN=el-token-que-te-dio-botfather
   NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=BomberosVillaNuevaBot
   ```
   (sin el `@`, y sin comillas).
5. Reiniciá `npm run dev`.
6. Cada usuario entra a **Mi cuenta → Alertas por Telegram** dentro de la app y sigue las instrucciones en pantalla para vincularse.
7. En Vercel, agregá las mismas dos variables en **Settings → Environment Variables** para que funcione también en producción.

> El token queda visible en el navegador (es una variable `NEXT_PUBLIC_`), porque el envío se hace directo desde el cliente para evitar necesitar un servidor aparte. El riesgo es bajo (el bot solo puede mandar mensajes, no leer datos), pero tenelo en cuenta.

## Responder ACUDO/NO ACUDO desde Telegram (botones)

Además del mensaje, las alertas "con convocatoria" incluyen dos botones en Telegram. Para que funcionen hace falta un paso más, **y solo se puede hacer una vez que el sitio esté publicado en Vercel** (Telegram necesita una dirección `https` real, no funciona contra `localhost`):

1. En Supabase → **Project Settings → API**, copiá la clave **`service_role`** (la que dice "secret", NO la publishable).
2. En Vercel → tu proyecto → **Settings → Environment Variables**, agregá:
   ```env
   SUPABASE_SERVICE_ROLE_KEY=la-clave-service-role-de-supabase
   ```
   **Nunca** le pongas el prefijo `NEXT_PUBLIC_` a esta — si lo hacés, quedaría visible en el navegador y cualquiera podría usarla para saltarse toda la seguridad de tu base de datos.
3. Una vez desplegado (o redesplegado después de agregar la variable), avisale a Telegram dónde mandar los avisos de los botones. Pegá esto en la barra de tu navegador, reemplazando los dos valores:
   ```
   https://api.telegram.org/bot<TU_TOKEN>/setWebhook?url=https://<TU-SITIO>.vercel.app/api/telegram-webhook
   ```
   Debería responder `{"ok":true,"result":true,"description":"Webhook was set"}`.
4. Ahora, cuando alguien toque "✅ ACUDO" o "❌ NO ACUDO" en Telegram, el sistema guarda la respuesta automáticamente y edita el mensaje para confirmarlo.

## Emergencias con o sin convocatoria

Al accionar una alarma, hay un casillero **"Con convocatoria"**:
- **Marcado** (por defecto): la alerta pide ACUDO/NO ACUDO, tanto en la app como en Telegram (con botones).
- **Desmarcado**: es un aviso puramente informativo — no muestra botones de respuesta ni pide que nadie confirme nada. Útil para avisos que no necesitan gente (ej: "se cortó el agua del cuartel", "reunión reprogramada").

## Cómo probar el QR de asistencia

1. Con un usuario admin o guardia, entrá a **QR consola** y dejá esa pantalla abierta (por ejemplo en una tablet o PC del cuartel).
2. Con el celular de un bombero, entrá a **Escanear QR**, tocá "Activar cámara" y apuntá al código.
3. El primer escaneo debe registrar "Ingreso registrado correctamente" y aparecer en la lista de "Últimos movimientos" de la consola.
4. Escaneá de nuevo (podés tocar "Escanear de nuevo") — esta vez debe registrar "Salida".
5. Nota: como el QR se renueva cada 45 segundos, si tarda mucho entre escanear y confirmar puede pedirte reintentar — es normal, solo escaneá el código actualizado.

## Cómo probar que la RLS funciona

Antes de dar por buena la V1, conviene verificar a mano:

1. Crear dos usuarios (el primero será admin, el segundo bombero).
2. Con el usuario bombero, intentar cambiar su propio rol o `is_active` desde la pestaña Personal — no debería tener el control disponible, y si se intenta vía API directamente, el trigger de la base lo revierte.
3. Marcar ingreso con el bombero y verificar que no se pueda marcar un segundo ingreso abierto (el botón cambia a "Marcar salida").
4. Como admin, intentar sacarse el rol de admin a sí mismo cuando es el único admin activo — el sistema debe rechazarlo.
5. Abrir el dashboard en dos pestañas y marcar ingreso en una: la otra debería actualizarse sola (Realtime).

## Importante para esta V1

Esta versión es deliberadamente básica. Todavía **NO** incluye:

- Emergencias.
- Convocatorias.
- Notificaciones push.
- Móviles.
- Intervenciones.
- GPS/mapas.
- Inventario.

La idea es probar primero login, personal, disponibilidad y asistencia. Luego agregamos el módulo de emergencias sobre esta misma base.

## Estructura

```text
app/
  page.tsx             Login / registro inicial
  dashboard/            Dashboard
  personal/             Personal y roles
  asistencia/           Entrada/salida
components/
  AuthProvider.tsx
  ProtectedRoute.tsx
  AppShell.tsx
lib/
  supabase.ts
  types.ts
supabase/
  schema.sql
public/
  manifest.webmanifest
```

## Seguridad

Las tablas tienen **Row Level Security (RLS)**. Un usuario autenticado solo puede leer datos de su organización. Además:

- Un trigger impide que un bombero se cambie a sí mismo el rol, la organización o el estado activo desde la consola del navegador; solo puede modificar su disponibilidad.
- Un trigger impide que un bombero altere la hora de ingreso u otros campos sensibles de su asistencia; solo puede marcar su propia salida.
- Un admin no puede degradarse a sí mismo ni desactivarse si es el único administrador activo del cuartel (evita quedarse sin nadie con permisos).
- El administrador puede editar perfiles de su organización; guardia y admin pueden registrar asistencia de terceros (fichar a mano).

## Troubleshooting

- **"Faltan las variables de entorno..."** al correr `npm run dev`: falta crear `.env.local` con los valores reales de tu proyecto de Supabase.
- **Login funciona pero no aparece nada en el dashboard**: revisá que hayas ejecutado `supabase/schema.sql` completo — sin las tablas y policies, las consultas devuelven vacío por RLS.
- **Error "Email not confirmed"**: desactivá "Confirm email" en Supabase (ver punto 4) o confirmá el correo recibido.
- **No podés cambiarte el rol como admin**: si sos el único admin activo, es intencional — necesitás otro admin antes de degradarte.

## Íconos PWA

`public/manifest.webmanifest` no trae íconos todavía (array vacío). Para que el "agregar a pantalla de inicio" se vea bien, agregá `icon-192.png` e `icon-512.png` en `public/` y referencialos en el manifest.
