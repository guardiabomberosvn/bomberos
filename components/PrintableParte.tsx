"use client";

import type {
  Intervention,
  InterventionDamagedVehicle,
  InterventionUnit,
  InterventionVictim,
  Profile,
  Vehicle,
} from "@/lib/types";
import { INCIDENT_SUBTYPES, RESCUE_ANIMAL_STATUS, RESCUE_PERSON_STATUS, DAMAGE_TYPES, VICTIM_ROLES, TRIAGE_COLORS } from "@/lib/types";

// Reproduce, en HTML/CSS pensado para imprimir, el "Parte de siniestro" en
// papel de la Asociación Bomberos Voluntarios Villa Nueva (frente y dorso).
// Se muestra oculto en pantalla y se hace visible solo durante la impresión
// (ver la regla @media print en app/globals.css), así el botón "Descargar
// PDF" dispara window.print() y el usuario elige "Guardar como PDF" o
// imprimir directo, con exactamente este formato para firmar.

function Check({ on }: { on: boolean }) {
  return <span className="pp-check">{on ? "☑" : "☐"}</span>;
}

function Field({ label, value, className = "" }: { label: string; value?: string | null; className?: string }) {
  return (
    <div className={`pp-field ${className}`}>
      <span className="pp-field-label">{label}</span>
      <span className="pp-field-value">{value || " "}</span>
    </div>
  );
}

export function PrintableParte({
  intervention: i,
  units,
  damagedVehicles,
  victims,
  vehicles,
  personal,
}: {
  intervention: Intervention;
  units: InterventionUnit[];
  damagedVehicles: InterventionDamagedVehicle[];
  victims: InterventionVictim[];
  vehicles: Vehicle[];
  personal: Profile[];
}) {
  const vehicleName = (id: string) => vehicles.find((v) => v.id === id)?.name ?? "—";
  const personName = (id: string | null) => (id ? personal.find((p) => p.id === id)?.full_name ?? "—" : "—");

  const fecha = new Date(i.occurred_at);
  const subtypeOptions = i.incident_category ? INCIDENT_SUBTYPES[i.incident_category] ?? [] : [];

  return (
    <div id="printable-parte" className="pp-page">
      <header className="pp-header">
        <img src="/logo.png" alt="" className="pp-logo" />
        <div className="pp-header-text">
          <h1>ASOCIACIÓN BOMBEROS VOLUNTARIOS VILLA NUEVA</h1>
          <p>Decreto y orden Municipal Villa Nueva N° 124 y 455/00</p>
          <p>Personería Jurídica Expedientes N°00007/29199/00 - Resolución N° 274 &quot;A&quot;/01</p>
          <p>Santa Fe 1150 - Villa Nueva Cba. Tel:100 - (0353) - 4913333/388 - 4911716</p>
        </div>
      </header>

      <p className="pp-parte-title">
        Parte de siniestro N°{" "}
        <strong>
          {i.parte_number ?? "—"}/{i.parte_year ?? fecha.getFullYear()}
        </strong>{" "}
        &nbsp;&nbsp; Fecha <strong>{fecha.toLocaleDateString("es-AR")}</strong>
      </p>

      <div className="pp-row">
        <Field label="1- Aviso efectuado por" value={i.reporter_name} className="pp-grow" />
        <Field label="Tel" value={i.caller_phone} />
        <Field label="DNI" value={i.reporter_dni} />
      </div>

      <div className="pp-row">
        <Field label="2- Lugar del siniestro" value={i.address} className="pp-grow" />
        <Field label="entre calle" value={i.cross_street} className="pp-grow" />
      </div>
      <div className="pp-row">
        <Field label="Localidad" value={i.barrio} className="pp-grow" />
      </div>

      <div className="pp-row">
        <Field label="3- Tipo" value={i.tipo_code} />
        <Field label="Motivo" value={i.motivo_code} className="pp-grow" />
      </div>
      <div className="pp-row">
        <Field label="Referencia" value={i.reference_code} />
        <Field label="Guardia" value={i.guard_departure} />
        <Field label="Hs. Salida" value={i.departed_at ? new Date(i.departed_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : ""} />
        <Field label="Hs. Llegada" value={i.returned_at ? new Date(i.returned_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : ""} />
        <Field label="Guardia" value={i.guard_return} />
      </div>

      <div className="pp-box pp-classify">
        <div className="pp-classify-cols">
          {(["Incendio", "Accidente", "Rescate"] as const).map((cat) => (
            <div key={cat} className="pp-classify-col">
              <p className="pp-classify-head">
                <Check on={i.incident_category === cat} /> {cat.toUpperCase()}
              </p>
              {(INCIDENT_SUBTYPES[cat] ?? []).map((sub) => (
                <p key={sub} className="pp-classify-item">
                  <Check on={i.incident_category === cat && i.incident_subtype === sub} /> {sub}
                  {i.incident_category === cat && i.incident_subtype === sub && sub.match(/otro/i) && i.incident_subtype_detail
                    ? `: ${i.incident_subtype_detail}`
                    : ""}
                </p>
              ))}
            </div>
          ))}
          <div className="pp-classify-col">
            <p className="pp-classify-head">
              <Check on={!i.incident_category || !["Incendio", "Accidente", "Rescate"].includes(i.incident_category)} /> OTRO SERV.
            </p>
          </div>
        </div>
        {i.incident_category === "Rescate" && i.incident_subtype === "Persona" && (
          <p className="pp-classify-item">
            {RESCUE_PERSON_STATUS.map((s) => (
              <span key={s} className="pp-inline-check">
                <Check on={i.incident_subtype_detail === s} /> {s}
              </span>
            ))}
          </p>
        )}
        {i.incident_category === "Rescate" && i.incident_subtype === "Animal" && (
          <p className="pp-classify-item">
            {RESCUE_ANIMAL_STATUS.map((s) => (
              <span key={s} className="pp-inline-check">
                <Check on={i.incident_subtype_detail === s} /> {s}
              </span>
            ))}
          </p>
        )}
      </div>

      <p className="pp-section-title">4- Datos de los vehículos siniestrados</p>
      <table className="pp-table">
        <thead>
          <tr>
            <th>Rodado</th>
            <th>Marca</th>
            <th>Modelo</th>
            <th>Dominio</th>
            <th>Seguro</th>
            <th>Póliza</th>
          </tr>
        </thead>
        <tbody>
          {(damagedVehicles.length ? damagedVehicles : [null]).map((dv, idx) => (
            <tr key={dv?.id ?? idx}>
              <td>{dv?.vehicle_number ?? idx + 1}°</td>
              <td>{dv?.brand}</td>
              <td>{dv?.model}</td>
              <td>{dv?.plate}</td>
              <td>{dv?.insurance}</td>
              <td>{dv?.policy_number}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="pp-section-title">
        5- Datos de los damnificados &nbsp; SE SOLICITÓ APOYO{" "}
        <Check on={i.support_requested} /> SI <Check on={!i.support_requested} /> NO &nbsp;&nbsp; UNIDAD EN APOYO A U N°{" "}
        {i.support_unit_number || "    "}
      </p>
      {victims.length === 0 ? (
        <p className="pp-empty">Sin damnificados cargados.</p>
      ) : (
        victims.map((v) => (
          <div key={v.id} className="pp-victim">
            <div className="pp-row">
              <span className="pp-field-label">Rodado N°</span>
              <span className="pp-field-value pp-narrow">{v.vehicle_number ?? ""}</span>
              <Field label="Apellido y Nombre" value={v.full_name} className="pp-grow" />
              <Field label="Edad" value={v.age} />
              <Field label="DNI" value={v.dni} />
            </div>
            <div className="pp-row">
              {VICTIM_ROLES.map((r) => (
                <span key={r.value} className="pp-inline-check">
                  <Check on={v.role === r.value} /> {r.label}
                </span>
              ))}
            </div>
            <div className="pp-row">
              <Field label="Domicilio" value={v.address} className="pp-grow" />
              <Field label="N°" value={v.address_number} />
              <Field label="Localidad" value={v.locality} />
            </div>
            <div className="pp-row">
              <Field label="Provincia" value={v.province} />
              <Field label="N° Tel." value={v.phone} />
              <span className="pp-inline-check">
                Herido <Check on={v.injured} /> SI <Check on={!v.injured} /> NO
              </span>
            </div>
            <div className="pp-row">
              {TRIAGE_COLORS.map((c) => (
                <span key={c.value} className="pp-inline-check">
                  <Check on={v.triage_color === c.value} /> {c.label}
                </span>
              ))}
              <span className="pp-inline-check">
                Trasladado <Check on={v.transferred} /> SI <Check on={!v.transferred} /> NO
              </span>
            </div>
            <div className="pp-row">
              <Field label="Trasladado por" value={v.transferred_by} className="pp-grow" />
              <Field label="Hacia" value={v.transferred_to} className="pp-grow" />
              <Field label="Recibe Dr/a" value={v.receiving_doctor} className="pp-grow" />
            </div>
          </div>
        ))
      )}

      {(i.incident_category === "Incendio" || i.damage_victim_name || i.damage_type) && (
        <>
          <p className="pp-section-title">6- INCENDIO - Datos damnificado</p>
          <div className="pp-row">
            <Field label="Apellido y Nombre" value={i.damage_victim_name} className="pp-grow" />
            <Field label="Edad" value={i.damage_victim_age} />
            <Field label="DNI" value={i.damage_victim_dni} />
          </div>
          <p className="pp-classify-item">
            Datos sobre lo dañado:{" "}
            {DAMAGE_TYPES.map((t) => (
              <span key={t} className="pp-inline-check">
                <Check on={i.damage_type === t} /> {t}
              </span>
            ))}
            <span className="pp-hint"> (descripción en observaciones)</span>
          </p>
          <div className="pp-row">
            <span className="pp-inline-check">
              POLICIAL <Check on={i.involved_policial} /> SI <Check on={!i.involved_policial} /> NO
            </span>
            <span className="pp-inline-check">
              TRANSITO <Check on={i.involved_transito} /> SI <Check on={!i.involved_transito} /> NO
            </span>
            <span className="pp-inline-check">
              FORENSE <Check on={i.involved_forense} /> SI <Check on={!i.involved_forense} /> NO
            </span>
            <span className="pp-inline-check">
              JUZGADO <Check on={i.involved_juzgado} /> SI <Check on={!i.involved_juzgado} /> NO
            </span>
          </div>
          <div className="pp-row">
            <Field label="N° de móvil" value={i.mobile_unit_number} />
            <Field label="A cargo" value={[i.in_charge_1, i.in_charge_2].filter(Boolean).join(" · ")} className="pp-grow" />
          </div>
          {units.length === 0 ? (
            <p className="pp-empty">Sin unidades asignadas.</p>
          ) : (
            units.map((u) => (
              <div key={u.id} className="pp-row">
                <Field label="U N°" value={vehicleName(u.vehicle_id)} />
                <Field label="Km Salida" value={u.km_out != null ? String(u.km_out) : ""} />
                <Field label="Km Regreso" value={u.km_in != null ? String(u.km_in) : ""} />
                <Field label="Personal a cargo" value={u.personnel_in_charge || personName(u.driver_id)} className="pp-grow" />
                <Field
                  label="Personal que concurrió"
                  value={[u.crew_member_1, u.crew_member_2, u.crew_member_3].filter(Boolean).join(" · ")}
                  className="pp-grow"
                />
              </div>
            ))
          )}
        </>
      )}

      {i.medical_refusal && (
        <>
          <p className="pp-section-title">7- Negación de Atención Médica</p>
          <p className="pp-legal-text">
            El Sr/es <strong>{i.medical_refusal_name}</strong> DNI <strong>{i.medical_refusal_dni}</strong>, se niega a la
            atención médica. Por lo tanto la Asociación de Bomberos Voluntarios de Villa Nueva Cba. no se responsabiliza por
            daños posteriores al hecho.
          </p>
          <div className="pp-signature-row">
            <span>Firma: ____________________</span>
            <span>Aclaración: {i.medical_refusal_name}</span>
            <span>DNI: {i.medical_refusal_dni}</span>
          </div>
        </>
      )}

      <p className="pp-section-title">8- Observaciones</p>
      <p className="pp-observaciones">{i.observations || " "}</p>

      <div className="pp-signature-row pp-footer">
        <span>9- Confeccionó: {personName(i.created_by)}</span>
        <span>10- Revisó: {i.reviewed_by ? personName(i.reviewed_by) : "________________________"}</span>
      </div>
    </div>
  );
}
