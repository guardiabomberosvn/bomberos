import type { MaintenanceAlertLevel, MaintenanceRecord } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Calcula el semáforo de alerta de un mantenimiento comparando la fecha
 * objetivo (target_date) contra hoy, y/o el km objetivo (target_km) contra
 * el km actual del vehículo (currentKm). Si hay ambos criterios, se usa el
 * más urgente de los dos.
 */
export function getMaintenanceAlertLevel(
  record: MaintenanceRecord,
  currentKm?: number | null
): MaintenanceAlertLevel {
  if (record.status === "completado") return "completado";

  const levels: MaintenanceAlertLevel[] = [];

  if (record.target_date) {
    const daysLeft = Math.floor(
      (new Date(record.target_date).getTime() - Date.now()) / DAY_MS
    );
    if (daysLeft < 0) levels.push("vencido");
    else if (daysLeft <= 7) levels.push("muy_proximo");
    else if (daysLeft <= 30) levels.push("proximo");
    else levels.push("en_termino");
  }

  if (record.target_km != null && currentKm != null) {
    const kmLeft = record.target_km - currentKm;
    if (kmLeft < 0) levels.push("vencido");
    else if (kmLeft <= 500) levels.push("muy_proximo");
    else if (kmLeft <= 2000) levels.push("proximo");
    else levels.push("en_termino");
  }

  if (levels.length === 0) return "en_termino";

  const priority: MaintenanceAlertLevel[] = [
    "vencido",
    "muy_proximo",
    "proximo",
    "en_termino",
  ];
  return priority.find((p) => levels.includes(p)) ?? "en_termino";
}
