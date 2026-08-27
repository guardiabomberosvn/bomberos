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
  // Permisos personalizados por usuario (apartado "Administración"). null =
  // usa el comportamiento por defecto de su rol (compatibilidad con
  // usuarios existentes); un array = acceso restringido/ampliado a
  // exactamente esas secciones (ver lib/permissions.ts).
  allowed_sections: string[] | null;
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
  emergency_type_id: string | null;
  motive_id: string | null;
  motive_code: string | null;
  motive_name: string | null;
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

export interface EmergencyTypeMotive {
  id: string;
  emergency_type_id: string;
  name: string;
  code: string | null;
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

export const OTHER_FORCE_SERVICES = [
  "SERV.107 - V.N",
  "SERV.107 - V.M",
  "POLICIA DE LA PROV.",
  "GUARDIA LOCAL",
  "TRANSITO",
  "ALUMBRADO",
  "EPEC",
  "BV. VILLA MARIA",
  "ECOGAS",
  "COPP. DE AGUA",
  "GENDARMERIA",
];

export interface StockItem {
  id: string;
  organization_id: string;
  name: string;
  unit: string;
  initial_stock: number;
  min_stock: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StockWithdrawal {
  id: string;
  organization_id: string;
  item_id: string;
  quantity: number;
  withdrawn_at: string;
  operator_id: string | null;
  withdrawn_by: string | null;
  destination: string | null;
  notes: string | null;
  shift_id: string | null;
}

export interface OtherForceNotice {
  id: string;
  organization_id: string;
  service_name: string;
  called_at: string;
  code: string | null;
  cause: string;
  address: string | null;
  locality: string | null;
  received_by_name: string | null;
  taken_by: string | null;
  shift_id: string | null;
  notes: string | null;
  created_at: string;
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
  // Ojo: en esta tabla la columna real en la base es "created_by" (no
  // "registered_by" como en vehicle_movements y otras tablas).
  created_by: string;
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
  responsible_id: string | null;
  target_date: string | null;
  target_km: number | null;
  status: MaintenanceStatus;
  cost: number | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  completed_at: string | null;
  alert_notified_at: string | null;
  // Hasta qué aviso fijo ya se mandó para esta orden: 15 días antes, 1
  // semana antes, 1 día antes (mientras sigue "pendiente"), o el aviso
  // único al asignado cuando ya está "en proceso".
  alert_checkpoint: MaintenanceAlertCheckpoint | null;
}

export type MaintenanceAlertCheckpoint =
  | "15_dias"
  | "1_semana"
  | "1_dia"
  | "en_proceso_dia_antes";

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

export type IncidentCategory =
  | "Incendio"
  | "Accidente"
  | "Salvataje"
  | "Rescate"
  | "Mantenimiento / Tareas grales."
  | "Organización funcional";

export const INCIDENT_CATEGORIES: IncidentCategory[] = [
  "Incendio",
  "Accidente",
  "Salvataje",
  "Rescate",
  "Mantenimiento / Tareas grales.",
  "Organización funcional",
];

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
  parte_number: number | null;
  parte_year: number | null;
  caller_phone: string | null;
  address: string | null;
  barrio: string | null;
  incident_category: IncidentCategory | null;
  fuel_notes: string | null;
  shift_id: string | null;
  // 1- Aviso efectuado por
  reporter_name: string | null;
  reporter_dni: string | null;
  // 2- Lugar del siniestro
  cross_street: string | null;
  // 3- Tipo / Motivo / guardia / horarios generales
  tipo_code: string | null;
  motivo_code: string | null;
  reference_code: string | null;
  guard_departure: string | null;
  guard_return: string | null;
  departed_at: string | null;
  returned_at: string | null;
  // Clasificación del siniestro
  incident_subtype: string | null;
  incident_subtype_detail: string | null;
  // Apoyo solicitado
  support_requested: boolean;
  support_unit_number: string | null;
  // 6- INCENDIO: datos sobre lo dañado
  damage_victim_name: string | null;
  damage_victim_age: string | null;
  damage_victim_dni: string | null;
  damage_type: string | null;
  involved_policial: boolean;
  involved_transito: boolean;
  involved_forense: boolean;
  involved_juzgado: boolean;
  mobile_unit_number: string | null;
  in_charge: string[];
  // 7- Negación de atención médica
  medical_refusal: boolean;
  medical_refusal_name: string | null;
  medical_refusal_dni: string | null;
  // 10- Revisó
  reviewed_by: string | null;
  reviewed_at: string | null;
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
  personnel_in_charge: string | null;
  crew_members: string[];
}

export interface InterventionDamagedVehicle {
  id: string;
  intervention_id: string;
  vehicle_number: number | null;
  brand: string | null;
  model: string | null;
  plate: string | null;
  insurance: string | null;
  policy_number: string | null;
  created_at: string;
}

export type VictimRole = "propietario" | "conductor" | "acompanante" | "peaton";
export type TriageColor = "rojo" | "amarillo" | "verde" | "negro" | "blanco_sin_talon";

export interface InterventionVictim {
  id: string;
  intervention_id: string;
  vehicle_number: number | null;
  role: VictimRole | null;
  full_name: string | null;
  age: string | null;
  dni: string | null;
  address: string | null;
  address_number: string | null;
  locality: string | null;
  province: string | null;
  phone: string | null;
  injured: boolean;
  triage_color: TriageColor | null;
  transferred: boolean;
  transferred_by: string | null;
  transferred_to: string | null;
  receiving_doctor: string | null;
  created_at: string;
}

// Subtipos de siniestro según la categoría elegida (checkboxes del papel).
export const INCIDENT_SUBTYPES: Record<string, string[]> = {
  Incendio: ["Vivienda", "Vehículo", "Campos", "Otros"],
  Accidente: ["Automóvil", "Colectivo", "Animal", "Otro"],
  Rescate: ["Persona", "Animal"],
};
export const RESCUE_PERSON_STATUS = ["Libre", "Atrapado", "Ahogado"];
export const RESCUE_ANIMAL_STATUS = ["Vivo", "Muerto"];

export const DAMAGE_TYPES = [
  "Rodado",
  "Casa",
  "Galpón",
  "Fábrica",
  "Industria",
  "Campo",
  "Pastizales",
  "Baldío",
];

export const VICTIM_ROLES: { value: VictimRole; label: string }[] = [
  { value: "propietario", label: "Propietario" },
  { value: "conductor", label: "Conductor" },
  { value: "acompanante", label: "Acompañante" },
  { value: "peaton", label: "Peatón" },
];

export const TRIAGE_COLORS: { value: TriageColor; label: string }[] = [
  { value: "rojo", label: "Rojo" },
  { value: "amarillo", label: "Amarillo" },
  { value: "verde", label: "Verde" },
  { value: "negro", label: "Negro" },
  { value: "blanco_sin_talon", label: "Blanco o sin talón" },
];

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
