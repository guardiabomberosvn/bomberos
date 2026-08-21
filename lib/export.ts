import * as XLSX from "xlsx";

/**
 * Descarga un archivo .xlsx con los datos dados. `rows` debe ser un arreglo
 * de objetos planos (clave = nombre de columna, valor = celda).
 */
export function exportToExcel(
  rows: Record<string, string | number | null | undefined>[],
  filename: string,
  sheetName = "Datos"
) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
