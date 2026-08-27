import { supabase } from "@/lib/supabase";
import { sendTelegramMessage } from "@/lib/telegram";
import type { MaintenanceAlertLevel, MaintenanceRecord, Profile, Vehicle } from "@/lib/types";

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
 * Manda un mensaje de Telegram puntual a la persona asignada como
 * responsable de una orden de mantenimiento (o de un hallazgo convertido en
 * orden), si esa persona tiene el Telegram vinculado. Si no lo tiene, no
 * hace nada (no hay forma de avisarle por ese medio).
 */
export async function notifyResponsible(responsibleProfile: Profile | undefined | null, message: string) {
  if (!responsibleProfile?.telegram_chat_id) return;
  await sendTelegramMessage(responsibleProfile.telegram_chat_id, message);
}

// Avisos fijos mientras la orden sigue "pendiente": 15 días antes, 1 semana
// antes y 1 día antes (o ya vencido). Cada uno se manda una sola vez.
type PendingCheckpoint = "15_dias" | "1_semana" | "1_dia";

const PENDING_CHECKPOINT_RANK: Record<PendingCheckpoint, number> = {
  "15_dias": 1,
  "1_semana": 2,
  "1_dia": 3,
};

function pendingCheckpointForDaysLeft(daysLeft: number): PendingCheckpoint | null {
  if (daysLeft <= 1) return "1_dia";
  if (daysLeft <= 7) return "1_semana";
  if (daysLeft <= 15) return "15_dias";
  return null;
}

const PENDING_CHECKPOINT_TELEGRAM_LABELS: Record<PendingCheckpoint, string> = {
  "15_dias": "🟡 Vence en 15 días o menos",
  "1_semana": "🟠 Vence en 1 semana o menos",
  "1_dia": "🔴 Vence mañana o ya venció",
};

/**
 * Revisa las órdenes de mantenimiento pendientes y manda los avisos por
 * Telegram que correspondan:
 *
 *  - Mientras la orden sigue "pendiente": tres avisos fijos, cada uno una
 *    sola vez, a los contactos generales configurados — 15 días antes de la
 *    fecha objetivo, 1 semana antes y 1 día antes (o vencido). Se guarda en
 *    alert_checkpoint hasta cuál de los tres ya se mandó, para no repetir.
 *  - Si la orden pasa a "en proceso", esos tres avisos generales se cortan:
 *    en su lugar se manda un único mensaje, solo a la persona asignada como
 *    responsable, el día antes de que venza (o si ya venció y sigue en
 *    proceso).
 *
 * El "claim" con el update condicional evita que dos sesiones abiertas al
 * mismo tiempo (o dos recargas seguidas) manden el mismo aviso duplicado.
 */
export async function checkAndNotifyMaintenanceDueDates(
  organizationId: string,
  records: MaintenanceRecord[],
  vehicles: Vehicle[],
  personal: Profile[]
) {
  const pending = records.filter((r) => r.status !== "completado" && r.target_date);

  for (const r of pending) {
    const vehicle = vehicles.find((v) => v.id === r.vehicle_id);
    const daysLeft = Math.floor(
      (new Date(r.target_date as string).getTime() - Date.now()) / DAY_MS
    );

    if (r.status === "en_proceso") {
      if (daysLeft > 1) continue;
      if (r.alert_checkpoint === "en_proceso_dia_antes") continue;
      const responsible = personal.find((p) => p.id === r.responsible_id);
      if (!responsible) continue;

      const { data: claimed } = await supabase
        .from("maintenance_records")
        .update({ alert_checkpoint: "en_proceso_dia_antes", alert_notified_at: new Date().toISOString() })
        .eq("id", r.id)
        .or("alert_checkpoint.is.null,alert_checkpoint.neq.en_proceso_dia_antes")
        .select("id");
      if (!claimed || claimed.length === 0) continue;

      await notifyResponsible(
        responsible,
        `🔧 <b>Mantenimiento en proceso — vence mañana</b>\n` +
          `${r.work}${vehicle ? " — " + vehicle.name : ""}\n` +
          `Fecha objetivo: ${r.target_date}\n` +
          `Revisalo en la app, sección Mantenimiento.`
      );
      continue;
    }

    const checkpoint = pendingCheckpointForDaysLeft(daysLeft);
    if (!checkpoint) continue;
    const alreadyRank =
      r.alert_checkpoint && r.alert_checkpoint in PENDING_CHECKPOINT_RANK
        ? PENDING_CHECKPOINT_RANK[r.alert_checkpoint as PendingCheckpoint]
        : 0;
    if (PENDING_CHECKPOINT_RANK[checkpoint] <= alreadyRank) continue;

    const { data: claimed } = await supabase
      .from("maintenance_records")
      .update({ alert_checkpoint: checkpoint, alert_notified_at: new Date().toISOString() })
      .eq("id", r.id)
      .or(`alert_checkpoint.is.null,alert_checkpoint.neq.${checkpoint}`)
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    const label = PENDING_CHECKPOINT_TELEGRAM_LABELS[checkpoint];
    const message =
      `🔧 <b>Mantenimiento ${label}</b>\n` +
      `${r.work}${vehicle ? " — " + vehicle.name : ""}\n` +
      `Fecha objetivo: ${r.target_date}\n` +
      `Revisalo en la app, sección Mantenimiento.`;
    await notifyMaintenanceContacts(organizationId, message);
  }
}
