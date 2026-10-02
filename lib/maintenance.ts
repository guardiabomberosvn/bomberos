import { supabase } from "@/lib/supabase";
import { sendTelegramMessage } from "@/lib/telegram";
import type { MaintenanceAlertLevel, Profile, ServiceAlertCheckpoint, Vehicle } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Calcula el semáforo de alerta del PRÓXIMO SERVICE de una unidad,
 * comparando next_service_date contra hoy y/o next_service_km contra el km
 * actual del vehículo. Si hay ambos criterios, se usa el más urgente de los
 * dos. Esto reemplaza a la vieja getMaintenanceAlertLevel (que miraba cada
 * orden de mantenimiento) — el próximo service ahora es un dato de la
 * unidad, no de una orden puntual.
 */
export function getVehicleServiceAlertLevel(vehicle: Vehicle): MaintenanceAlertLevel | null {
  if (!vehicle.next_service_date && vehicle.next_service_km == null) return null;

  const levels: MaintenanceAlertLevel[] = [];

  if (vehicle.next_service_date) {
    const daysLeft = Math.floor(
      (new Date(vehicle.next_service_date).getTime() - Date.now()) / DAY_MS
    );
    if (daysLeft < 0) levels.push("vencido");
    else if (daysLeft <= 7) levels.push("muy_proximo");
    else if (daysLeft <= 30) levels.push("proximo");
    else levels.push("en_termino");
  }

  if (vehicle.next_service_km != null) {
    const kmLeft = vehicle.next_service_km - vehicle.km;
    if (kmLeft < 0) levels.push("vencido");
    else if (kmLeft <= 500) levels.push("muy_proximo");
    else if (kmLeft <= 2000) levels.push("proximo");
    else levels.push("en_termino");
  }

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
    link: "/flota",
  });
}

// Avisos fijos a medida que se acerca el próximo service: 15 días antes, 1
// semana antes y 1 día antes (o ya vencido) — o su equivalente en km (2000 /
// 500, los mismos umbrales que usa getVehicleServiceAlertLevel para el
// semáforo visual, así quedan consistentes entre sí). Cada uno se manda una
// sola vez por unidad.
const CHECKPOINT_RANK: Record<ServiceAlertCheckpoint, number> = {
  "15_dias": 1,
  "1_semana": 2,
  "1_dia": 3,
};

function dateCheckpointForDaysLeft(daysLeft: number): ServiceAlertCheckpoint | null {
  if (daysLeft <= 1) return "1_dia";
  if (daysLeft <= 7) return "1_semana";
  if (daysLeft <= 15) return "15_dias";
  return null;
}

function kmCheckpointForKmLeft(kmLeft: number): ServiceAlertCheckpoint | null {
  if (kmLeft <= 500) return "1_dia";
  if (kmLeft <= 2000) return "1_semana";
  return null;
}

function mostUrgentCheckpoint(
  a: ServiceAlertCheckpoint | null,
  b: ServiceAlertCheckpoint | null
): ServiceAlertCheckpoint | null {
  if (!a) return b;
  if (!b) return a;
  return CHECKPOINT_RANK[a] >= CHECKPOINT_RANK[b] ? a : b;
}

const CHECKPOINT_TELEGRAM_LABELS: Record<ServiceAlertCheckpoint, string> = {
  "15_dias": "🟡 Vence en 15 días o menos",
  "1_semana": "🟠 Vence en 1 semana o menos",
  "1_dia": "🔴 Vence mañana o ya venció",
};

/**
 * Revisa el próximo service programado de cada unidad y manda los avisos
 * por Telegram que correspondan a los contactos generales configurados
 * ("Recibe alertas de mantenimiento"). El service puede tener fecha
 * objetivo, km objetivo, o ambos — si tiene ambos, se usa el criterio más
 * urgente de los dos. Cada uno de los tres avisos (15 días / 1 semana / 1
 * día o vencido) se manda una sola vez por unidad; se guarda en
 * vehicles.service_alert_checkpoint hasta cuál ya se mandó.
 *
 * Antes esto miraba cada orden de mantenimiento pendiente (y tenía además un
 * aviso aparte para cuando la orden pasaba a "en proceso"). Como el próximo
 * service ahora es un dato de la unidad y no de una orden puntual, ese
 * segundo aviso (al responsable asignado de la orden) ya no aplica — las
 * órdenes de mantenimiento son simplemente el registro de trabajos hechos.
 *
 * El "claim" con el update condicional evita que dos sesiones abiertas al
 * mismo tiempo (o dos recargas seguidas) manden el mismo aviso duplicado.
 */
export async function checkAndNotifyVehicleServiceDueDates(
  organizationId: string,
  vehicles: Vehicle[]
) {
  const pending = vehicles.filter(
    (v) => v.is_active && (v.next_service_date || v.next_service_km != null)
  );

  for (const v of pending) {
    const daysLeft = v.next_service_date
      ? Math.floor((new Date(v.next_service_date).getTime() - Date.now()) / DAY_MS)
      : null;
    const kmLeft = v.next_service_km != null ? v.next_service_km - v.km : null;

    const dateCheckpoint = daysLeft != null ? dateCheckpointForDaysLeft(daysLeft) : null;
    const kmCheckpoint = kmLeft != null ? kmCheckpointForKmLeft(kmLeft) : null;
    const checkpoint = mostUrgentCheckpoint(dateCheckpoint, kmCheckpoint);
    if (!checkpoint) continue;

    const alreadyRank =
      v.service_alert_checkpoint && v.service_alert_checkpoint in CHECKPOINT_RANK
        ? CHECKPOINT_RANK[v.service_alert_checkpoint]
        : 0;
    if (CHECKPOINT_RANK[checkpoint] <= alreadyRank) continue;

    const { data: claimed } = await supabase
      .from("vehicles")
      .update({ service_alert_checkpoint: checkpoint, service_alert_notified_at: new Date().toISOString() })
      .eq("id", v.id)
      .or(`service_alert_checkpoint.is.null,service_alert_checkpoint.neq.${checkpoint}`)
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    const targetLine =
      (v.next_service_date ? `Fecha: ${v.next_service_date}\n` : "") +
      (v.next_service_km != null
        ? `Km: ${v.next_service_km.toLocaleString("es-AR")} (actual: ${v.km.toLocaleString("es-AR")})\n`
        : "");

    const label = CHECKPOINT_TELEGRAM_LABELS[checkpoint];
    const message =
      `🔧 <b>Próximo service ${label}</b>\n` +
      `${v.name}${v.next_service_notes ? " — " + v.next_service_notes : ""}\n` +
      targetLine +
      `Revisalo en la app, sección Flota.`;
    await notifyMaintenanceContacts(organizationId, message);
    await notifyInApp(organizationId, `🔧 ${v.name}: próximo service ${label}`, v.next_service_notes ?? undefined);
  }
}
