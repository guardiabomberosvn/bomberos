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

/**
 * Agrega el aviso a la campanita de notificaciones (tabla "notifications").
 * Se llama siempre justo después de un "claim" exitoso (el mismo update
 * condicional que ya evita mandar el mensaje de Telegram duplicado), así
 * que también queda deduplicado sin lógica extra acá.
 */
async function notifyInApp(organizationId: string, title: string, body?: string) {
  await supabase.from("notifications").insert({
    organization_id: organizationId,
    type: "mantenimiento",
    title,
    body: body || null,
    link: "/mantenimiento",
  });
}

// Avisos fijos mientras la orden sigue "pendiente": 15 días antes, 1 semana
// antes y 1 día antes (o ya vencido). Cada uno se manda una sola vez. El
// mismo checkpoint también se usa para el service programado por KM (ver
// kmCheckpointForKmLeft más abajo) usando los mismos umbrales que el
// semáforo visual (getMaintenanceAlertLevel: 500 / 2000 km), así los dos
// quedan consistentes entre sí.
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

// Equivalente por kilómetros: antes esta función no existía, así que un
// service programado SOLO por km (sin fecha objetivo) nunca mandaba avisos
// por Telegram — checkAndNotifyMaintenanceDueDates solo miraba target_date.
function kmCheckpointForKmLeft(kmLeft: number): PendingCheckpoint | null {
  if (kmLeft <= 500) return "1_dia";
  if (kmLeft <= 2000) return "1_semana";
  return null;
}

// Si la orden tiene fecha Y km objetivo, se manda el aviso que corresponda
// al criterio más urgente de los dos (mismo criterio que usa
// getMaintenanceAlertLevel para el semáforo visual).
function mostUrgentCheckpoint(
  a: PendingCheckpoint | null,
  b: PendingCheckpoint | null
): PendingCheckpoint | null {
  if (!a) return b;
  if (!b) return a;
  return PENDING_CHECKPOINT_RANK[a] >= PENDING_CHECKPOINT_RANK[b] ? a : b;
}

const PENDING_CHECKPOINT_TELEGRAM_LABELS: Record<PendingCheckpoint, string> = {
  "15_dias": "🟡 Vence en 15 días o menos",
  "1_semana": "🟠 Vence en 1 semana o menos",
  "1_dia": "🔴 Vence mañana o ya venció",
};

/**
 * Revisa las órdenes de mantenimiento pendientes y manda los avisos por
 * Telegram que correspondan. El service programado puede tener fecha
 * objetivo, km objetivo, o ambos — si tiene ambos, se usa el criterio más
 * urgente de los dos para decidir cuándo avisar.
 *
 *  - Mientras la orden sigue "pendiente": tres avisos fijos, cada uno una
 *    sola vez, a los contactos generales configurados — equivalentes a 15
 *    días antes, 1 semana antes y 1 día antes (o vencido/pasado de km). Se
 *    guarda en alert_checkpoint hasta cuál de los tres ya se mandó, para no
 *    repetir.
 *  - Si la orden pasa a "en proceso", esos tres avisos generales se cortan:
 *    en su lugar se manda un único mensaje, solo a la persona asignada como
 *    responsable, cuando falta 1 día o menos (o 500 km o menos) para la
 *    fecha/km objetivo, o si ya se pasó y sigue en proceso.
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
  const pending = records.filter(
    (r) => r.status !== "completado" && (r.target_date || r.target_km != null)
  );

  for (const r of pending) {
    const vehicle = vehicles.find((v) => v.id === r.vehicle_id);

    const daysLeft = r.target_date
      ? Math.floor((new Date(r.target_date).getTime() - Date.now()) / DAY_MS)
      : null;
    const kmLeft =
      r.target_km != null && vehicle ? r.target_km - vehicle.km : null;

    const targetLine =
      (r.target_date ? `Fecha objetivo: ${r.target_date}\n` : "") +
      (r.target_km != null
        ? `Km objetivo: ${r.target_km.toLocaleString("es-AR")}${
            vehicle ? ` (actual: ${vehicle.km.toLocaleString("es-AR")})` : ""
          }\n`
        : "");

    if (r.status === "en_proceso") {
      const dateUrgent = daysLeft != null && daysLeft <= 1;
      const kmUrgent = kmLeft != null && kmLeft <= 500;
      if (!dateUrgent && !kmUrgent) continue;
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
        `🔧 <b>Mantenimiento en proceso — está por vencer</b>\n` +
          `${r.work}${vehicle ? " — " + vehicle.name : ""}\n` +
          targetLine +
          `Revisalo en la app, sección Mantenimiento.`
      );
      await notifyInApp(
        organizationId,
        "🔧 Mantenimiento en proceso — está por vencer",
        `${r.work}${vehicle ? " — " + vehicle.name : ""}`
      );
      continue;
    }

    const dateCheckpoint = daysLeft != null ? pendingCheckpointForDaysLeft(daysLeft) : null;
    const kmCheckpoint = kmLeft != null ? kmCheckpointForKmLeft(kmLeft) : null;
    const checkpoint = mostUrgentCheckpoint(dateCheckpoint, kmCheckpoint);
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
      targetLine +
      `Revisalo en la app, sección Mantenimiento.`;
    await notifyMaintenanceContacts(organizationId, message);
    await notifyInApp(
      organizationId,
      `🔧 Mantenimiento ${label}`,
      `${r.work}${vehicle ? " — " + vehicle.name : ""}`
    );
  }
}
