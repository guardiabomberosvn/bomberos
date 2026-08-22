import { supabase } from "@/lib/supabase";
import { sendTelegramMessage } from "@/lib/telegram";
import type { MaintenanceAlertLevel, MaintenanceRecord, Vehicle } from "@/lib/types";

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

/**
 * Manda un mensaje de Telegram a las personas que el admin marcó para
 * recibir avisos de mantenimiento (perfil > "Recibe alertas de
 * mantenimiento") y que además ya vincularon su Telegram. Si nadie está
 * configurado así, no manda nada (no cae de vuelta a todo el cuerpo).
 */
export async function notifyMaintenanceContacts(organizationId: string, message: string) {
  const { data } = await supabase
    .from("profiles")
    .select("telegram_chat_id")
    .eq("organization_id", organizationId)
    .eq("notify_maintenance", true)
    .eq("is_active", true)
    .not("telegram_chat_id", "is", null);

  const recipients = ((data as { telegram_chat_id: string | null }[]) ?? []).filter(
    (r) => r.telegram_chat_id
  );

  await Promise.all(
    recipients.map((r) => sendTelegramMessage(r.telegram_chat_id as string, message))
  );
}

/**
 * Revisa las órdenes de mantenimiento pendientes y avisa por Telegram (a los
 * contactos configurados) las que acaban de entrar en 🟠 muy próximo o
 * 🔴 vencido, una sola vez por orden (usa alert_notified_at para no repetir
 * el aviso en cada visita al dashboard). Si dos personas tienen la app
 * abierta al mismo tiempo, el "claim" con `.is('alert_notified_at', null)`
 * asegura que el aviso se mande una sola vez igual.
 */
export async function checkAndNotifyMaintenanceDueDates(
  organizationId: string,
  records: MaintenanceRecord[],
  vehicles: Vehicle[]
) {
  const pending = records.filter((r) => r.status !== "completado" && !r.alert_notified_at);

  for (const r of pending) {
    const vehicle = vehicles.find((v) => v.id === r.vehicle_id);
    const level = getMaintenanceAlertLevel(r, vehicle?.km);
    if (level !== "vencido" && level !== "muy_proximo") continue;

    // "Reclama" el aviso: si otra sesión ya lo marcó primero, esta
    // actualización no toca ninguna fila y no mandamos el mensaje duplicado.
    const { data: claimed } = await supabase
      .from("maintenance_records")
      .update({ alert_notified_at: new Date().toISOString() })
      .eq("id", r.id)
      .is("alert_notified_at", null)
      .select("id");

    if (!claimed || claimed.length === 0) continue;

    const label = level === "vencido" ? "🔴 VENCIDO" : "🟠 Muy próximo a vencer";
    const message =
      `🔧 <b>Mantenimiento ${label}</b>\n` +
      `${r.work}${vehicle ? " — " + vehicle.name : ""}\n` +
      (r.target_date ? `Fecha objetivo: ${r.target_date}\n` : "") +
      `Revisalo en la app, sección Mantenimiento.`;

    await notifyMaintenanceContacts(organizationId, message);
  }
}
