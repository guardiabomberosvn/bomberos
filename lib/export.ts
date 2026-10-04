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

/**
 * Descarga un archivo .pdf con una tabla (encabezado + filas), pensado para
 * listados para imprimir o archivar (ej: historial de turnos, asistencia).
 * Igual que con "xlsx", "jspdf"/"jspdf-autotable" se importan acá adentro
 * (import dinámico) para no pesar el resto de la app.
 */
export async function exportToPdf(
  rows: Record<string, string | number | null | undefined>[],
  filename: string,
  opts: { title?: string; subtitle?: string } = {}
) {
  const { jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape" });

  let cursorY = 14;
  if (opts.title) {
    doc.setFontSize(14);
    doc.text(opts.title, 14, cursorY);
    cursorY += 6;
  }
  if (opts.subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(opts.subtitle, 14, cursorY);
    cursorY += 4;
  }

  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const body = rows.map((row) => headers.map((h) => String(row[h] ?? "")));

  autoTable(doc, {
    head: [headers],
    body,
    startY: cursorY + 2,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [220, 38, 38] },
  });

  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
