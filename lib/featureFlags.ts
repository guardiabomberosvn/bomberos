// Interruptor temporal para la exigencia de "turno abierto".
//
// Varias secciones (Stock, Combustible, Mantenimiento, Proveedores, Flota,
// Hallazgos, las pestañas de Libro de Guardia, Asistencia (todos) y QR de
// asistencia) tienen una traba que le exige a un guardia tener un turno
// abierto en el Libro de Guardia antes de poder cargar o modificar algo.
//
// Se desactivó (2026-10-19) porque todavía no se adoptó en la práctica el
// hábito de abrir turno — estaba bloqueando operaciones normales. Cuando
// se implemente de verdad, volver a poner esto en `true` reactiva la
// traba en todas esas secciones de una sola vez, sin tener que tocar cada
// archivo de nuevo.
export const TURNO_GATING_ENABLED = false;
