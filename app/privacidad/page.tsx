export default function PrivacidadPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 text-neutral-800">
      <h1 className="text-2xl font-bold text-neutral-900">Política de Privacidad</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Sistema de gestión — Cuartel de Bomberos Voluntarios Villa Nueva / Villa María
      </p>

      <div className="mt-6 space-y-5 text-sm leading-relaxed">
        <p>
          Este sistema es una herramienta interna de uso exclusivo del cuartel de
          bomberos voluntarios, utilizada por su personal para registrar guardias,
          asistencia, mantenimiento de vehículos, combustible, emergencias y
          hallazgos. No está destinado al público en general y no se ofrece como
          servicio a terceros.
        </p>

        <div>
          <h2 className="font-semibold text-neutral-900">Qué información utilizamos</h2>
          <p className="mt-1">
            El sistema almacena datos que el propio personal del cuartel carga:
            nombre, rol dentro de la institución, registros de asistencia y guardias,
            información de vehículos y su mantenimiento, cargas de combustible,
            emergencias atendidas y hallazgos reportados (incluyendo, cuando
            corresponde, fotos adjuntas a esos hallazgos).
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-neutral-900">Fotos y Google Drive</h2>
          <p className="mt-1">
            Las fotos que el personal adjunta a un hallazgo se guardan en una carpeta
            de Google Drive propiedad del cuartel. Se accede a esa carpeta mediante
            una conexión autorizada por el propio cuartel (cuenta de Google
            guardiabomberosvn@gmail.com), únicamente para crear los archivos que el
            sistema sube — no se accede a ningún otro archivo o carpeta de esa cuenta.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-neutral-900">Con quién se comparte la información</h2>
          <p className="mt-1">
            La información cargada en el sistema es visible solamente para el
            personal autorizado del cuartel, según su rol. No se vende ni se comparte
            con terceros ajenos a la institución.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-neutral-900">Contacto</h2>
          <p className="mt-1">
            Ante cualquier consulta sobre esta política o sobre el uso de datos en el
            sistema, podés escribir a{" "}
            <a href="mailto:guardiabomberosvn@gmail.com" className="text-brand hover:underline">
              guardiabomberosvn@gmail.com
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
