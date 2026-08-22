export type Role = "admin" | "guardia" | "bombero";
export type Availability = "disponible" | "no_disponible";

export interface Profile {
  id: string;
  organization_id: string;
  email: string | null;
  full_name: string;
  legajo: string | null;
  rank: string | null;
  phone: string | null;
  role: Role;
  is_active: boolean;
  availability: Availability;
  telegram_chat_id: string | null;
  notify_maintenance: boolean;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRecord {
  id: string;
  organization_id: string;
  firefighter_id: string;
  checked_in_at: string;
  checked_out_at: string | null;
  type: string;
  notes: string | null;
  reason_id: string | null;
  created_at: string;
}

export interface AttendanceReason {
  id: string;
  organization_id: string;
  name: string;
  points: number;
  sort_order: number;
  is_active: boolean;
}

export interface Organization {
  id: string;
  name: string;
  city: string | null;
  province: string | null;
  created_at: string;
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  guardia: "Guardia",
  bombero: "Bombero",
};

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  disponible: "Disponible",
  no_disponible: "No disponible",
};

export type EmergencyStatus = "activa" | "cancelada" | "finalizada";
export type EmergencyTarget = "todos" | "individual" | "grupos";
export type EmergencyResponseValue = "acudo" | "no_acudo";

export interface Emergency {
  id: string;
  organization_id: string;
  title: string;
  address: string | null;
  notes: string | null;
  status: EmergencyStatus;
  target: EmergencyTarget;
  needs_response: boolean;
  created_by: string;
  created_at: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
}

export interface EmergencyResponse {
  id: string;
  emergency_id: string;
  profile_id: string;
  response: EmergencyResponseValue;
  responded_at: string;
}

export const EMERGENCY_STATUS_LABELS: Record<EmergencyStatus, string> = {
  activa: "Activa",
  cancelada: "Cancelada",
  finalizada: "Finalizada",
};

export interface EmergencyType {
  id: string;
  organization_id: string;
  name: string;
  code: string | null;
  color: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
}

export interface DispatchGroup {
  id: string;
  organization_id: string;
  name: string;
  is_active: boolean;
}

export interface GuardCall {
  id: string;
  organization_id: string;
  caller_name: string | null;
  caller_phone: string | null;
  reason: string | null;
  derived_to: string | null;
  taken_by: string;
  notes: string | null;
  status: "abierta" | "derivada" | "cerrada";
  created_at: string;
  closed_at: string | null;
  shift_id: string | null;
}

export interface GuardShift {
  id: string;
  organization_id: string;
  opened_by: string;
  opened_at: string;
  closed_by: string | null;
  closed_at: string | null;
  notes: string | null;
}

export interface GuardVisit {
  id: string;
  organization_id: string;
  visitor_name: string;
  reason: string | null;
  entered_at: string;
  exited_at: string | null;
  notes: string | null;
  registered_by: string;
}

export type VehicleStatus = "disponible" | "servicio" | "mantenimiento" | "fuera_de_servicio";

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  disponible: "Disponible",
  servicio: "En servicio",
  mantenimiento: "En mantenimiento",
  fuera_de_servicio: "Fuera de servicio",
};

export interface Vehicle {
  id: string;
  organization_id: string;
  name: string;
  type: string | null;
  status: VehicleStatus;
  km: number;
  is_active: boolean;
}

export interface FuelLoad {
  id: string;
  organization_id: string;
  vehicle_id: string;
  loaded_at: string;
  liters: number;
  km: number | null;
  cost: number | null;
  notes: string | null;
  registered_by: string;
}

export type MaintenanceType = "preventivo" | "correctivo" | "inspeccion";
export type MaintenanceStatus = "pendiente" | "en_proceso" | "completado";

export const MAINTENANCE_TYPE_LABELS: Record<MaintenanceType, string> = {
  preventivo: "Preventivo",
  correctivo: "Correctivo",
  inspeccion: "Inspección",
};

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  completado: "Completado",
};

export interface MaintenanceRecord {
  id: string;
  organization_id: string;
  vehicle_id: string | null;
  type: MaintenanceType;
  work: string;
  responsible: string | null;
  target_date: string | null;
  target_km: number | null;
  status: MaintenanceStatus;
  cost: number | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  completed_at: string | null;
  alert_notified_at: string | null;
}

// Nivel de alerta visual calculado en el cliente comparando la fecha/km
// objetivo contra hoy / el km actual del vehículo.
export type MaintenanceAlertLevel =
  | "completado"
  | "en_termino"
  | "proximo"
  | "muy_proximo"
  | "vencido";

export const MAINTENANCE_ALERT_LABELS: Record<MaintenanceAlertLevel, string> = {
  completado: "✅ Completado",
  en_termino: "🟢 En término",
  proximo: "🟡 Próximo",
  muy_proximo: "🟠 Muy próximo",
  vencido: "🔴 Vencido",
};

export interface Intervention {
  id: string;
  organization_id: string;
  emergency_id: string | null;
  title: string;
  occurred_at: string;
  personnel_in_charge: string | null;
  operator_id: string | null;
  observations: string | null;
  created_by: string;
  created_at: string;
}

export interface InterventionUnit {
  id: string;
  intervention_id: string;
  vehicle_id: string;
  driver_id: string | null;
  departed_at: string | null;
  returned_at: string | null;
  km_out: number | null;
  km_in: number | null;
}

export type FindingPriority = "baja" | "media" | "alta" | "critica";
export type FindingStatus = "pendiente" | "convertido" | "descartado";

export const FINDING_PRIORITY_LABELS: Record<FindingPriority, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  critica: "Crítica",
};

export const FINDING_STATUS_LABELS: Record<FindingStatus, string> = {
  pendiente: "Pendiente",
  convertido: "Convertido a orden",
  descartado: "Descartado",
};

export interface MaintenanceFinding {
  id: string;
  organization_id: string;
  vehicle_id: string | null;
  area: string | null;
  description: string;
  priority: FindingPriority;
  photo_url: string | null;
  status: FindingStatus;
  reported_by: string;
  created_at: string;
  converted_maintenance_id: string | null;
}

export type MovementReason =
  | "emergencia"
  | "mantenimiento"
  | "capacitacion"
  | "tramite"
  | "abastecimiento"
  | "otro";

export const MOVEMENT_REASON_LABELS: Record<MovementReason, string> = {
  emergencia: "Emergencia",
  mantenimiento: "Mantenimiento",
  capacitacion: "Capacitación",
  tramite: "Trámite",
  abastecimiento: "Abastecimiento",
  otro: "Otro",
};

export interface VehicleMovement {
  id: string;
  organization_id: string;
  vehicle_id: string;
  reason: MovementReason;
  driver_id: string | null;
  companions: string | null;
  departed_at: string;
  departure_km: number | null;
  returned_at: string | null;
  return_km: number | null;
  notes: string | null;
  registered_by: string;
}

export interface AgendaEvent {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  event_at: string;
  created_by: string;
}
