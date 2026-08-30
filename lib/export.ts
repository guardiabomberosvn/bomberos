// "xlsx" es una librería pesada — se importa acá adentro de cada función
// (import dinámico) en vez de arriba del archivo, para que el navegador
// solo la baje cuando alguien realmente aprieta "Exportar a Excel", no en
// cada página que podría llegar a usarla.

/**
 * Descarga un archivo .xlsx con los datos dados. `rows` debe ser un arreglo
 * de objetos planos (clave = nombre de columna, valor = celda).
 */
export async function exportToExcel(
  rows: Record<string, string | number | null | undefined>[],
  filename: string,
  sheetName = "Datos"
) {
  const XLSX = await import("xlsx");
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/**
 * Igual que exportToExcel pero para varias hojas en un mismo archivo
 * (ej: "Stock" + "Registro de retiros", como en la planilla original).
 */
export async function exportMultiSheetExcel(
  sheets: { name: string; rows: Record<string, string | number | null | undefined>[] }[],
  filename: string
) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows);
    // Excel no permite nombres de hoja de más de 31 caracteres.
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
  }
  XLSX.writeFile(workbook, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
