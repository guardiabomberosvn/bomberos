"use client";

import type { MaintenanceRecord } from "@/lib/types";
import { MAINTENANCE_STATUS_LABELS, MAINTENANCE_TYPE_LABELS } from "@/lib/types";

// Reemplaza al viejo botón "Imprimir" (que abría una ventana nueva y
// llamaba a window.print()). En el celular eso abría un diálogo de
// impresión que no servía de mucho — lo que en la práctica se necesita es
// mandar una foto/captura de la orden por WhatsApp. Esta vista queda
// prolija para sacarle una captura de pantalla directamente, sin diálogos
// del sistema de por medio.
export function MaintenancePreviewModal({
  record,
  vehicleName,
  onClose,
}: {
  record: MaintenanceRecord;
  vehicleName: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4 py-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-neutral-100 px-5 py-4">
          <h1 className="text-lg font-bold text-neutral-900">Orden de mantenimiento</h1>
          <p className="text-xs text-neutral-500">
            Generada {new Date().toLocaleString("es-AR")}
          </p>
        </div>

        <div className="divide-y divide-neutral-100 px-5">
          <Row label="Trabajo" value={record.work} />
          <Row label="Vehículo" value={vehicleName} />
          <Row label="Tipo" value={MAINTENANCE_TYPE_LABELS[record.type]} />
          <Row label="Estado" value={MAINTENANCE_STATUS_LABELS[record.status]} />
          <Row label="Personal encargado" value={record.responsible ?? "—"} />
          <Row
            label="Km al reparar"
            value={record.repair_km != null ? record.repair_km.toLocaleString("es-AR") : "—"}
          />
          <Row label="Proveedor / taller" value={record.provider ?? "—"} />
          <Row label="Quién lo reparó" value={record.performed_by ?? "—"} />
          <Row
            label="Precio"
            value={record.cost != null ? `$${record.cost.toLocaleString("es-AR")}` : "—"}
          />
          <Row label="Notas" value={record.notes ?? "—"} />
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-neutral-100 px-5 py-3">
          <p className="text-xs text-neutral-400">📸 Sacale una captura de pantalla para compartir</p>
          <button
            onClick={onClose}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="shrink-0 text-neutral-500">{label}</span>
      <span className="text-right font-medium text-neutral-800">{value}</span>
    </div>
  );
}
