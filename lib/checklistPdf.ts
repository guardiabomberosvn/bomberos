import {
  CHECKLIST_CATEGORY_LABELS,
  CHECKLIST_STATUS_LABELS,
  type ChecklistAnswer,
  type ChecklistItem,
  type ChecklistPoint,
  type ChecklistStatus,
} from "@/lib/types";

// Un checklist para el PDF: el equipo + sus puntos a revisar.
export interface ChecklistPdfEntry {
  item: ChecklistItem;
  points: ChecklistPoint[];
}

export interface ChecklistPdfOptions {
  // Imagen del escudo (data URL PNG) para el encabezado. Opcional.
  logoDataUrl?: string | null;
  // Quién descarga el PDF (aparece al pie). Opcional.
  generatedBy?: string | null;
}

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = PAGE_H - 8;
// Espacio que se deja libre abajo de cada página para el pie.
const BOTTOM_LIMIT = PAGE_H - 20;

const STATUS_RGB: Record<ChecklistStatus, [number, number, number]> = {
  verde: [22, 163, 74],
  amarillo: [202, 138, 4],
  rojo: [220, 38, 38],
};

function formatDateTime(iso: string | Date) {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Para armar un nombre de archivo sin tildes ni símbolos raros.
function slug(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function todayStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function checklistPdfFilename(entries: ChecklistPdfEntry[]) {
  if (entries.length === 1) {
    return `Checklist-${slug(entries[0].item.name) || "equipo"}-${todayStamp()}.pdf`;
  }
  return `Checklists-${todayStamp()}.pdf`;
}

// "jspdf" es pesado: se importa recién cuando alguien pide un PDF (igual que
// en lib/export.ts). Esta función permite bajarlo de antemano para que el
// PDF salga al instante cuando se aprieta el botón.
export async function preloadPdfLibraries() {
  await Promise.all([import("jspdf"), import("jspdf-autotable")]);
}

// Convierte el escudo del sistema en una imagen que se pueda poner en el PDF.
export async function loadLogoDataUrl(url = "/logo.png"): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Arma un PDF con una hoja de inspección por cada equipo (A4 vertical):
 * encabezado, equipo, estado (semáforo), quién inspeccionó y cuándo, la tabla
 * de puntos con Sí / No / No aplica, observaciones y línea de firma.
 * Si el equipo todavía no se inspeccionó, sale como formulario en blanco para
 * imprimir y completar a mano.
 */
export async function buildChecklistPdf(
  entries: ChecklistPdfEntry[],
  opts: ChecklistPdfOptions = {}
) {
  const { jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const lastTableY = () =>
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;

  entries.forEach((entry, index) => {
    if (index > 0) doc.addPage();
    const firstPage = doc.getNumberOfPages();
    const { item, points } = entry;
    const answers: Record<string, ChecklistAnswer> = item.answers ?? {};
    let y = 14;

    // --- Encabezado -------------------------------------------------------
    if (opts.logoDataUrl) {
      try {
        doc.addImage(opts.logoDataUrl, "PNG", MARGIN, y - 4, 16, 16);
      } catch {
        // si la imagen falla, el PDF sale igual sin escudo
      }
    }
    const titleX = opts.logoDataUrl ? MARGIN + 20 : MARGIN;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(30);
    doc.text("Checklist de inspección", titleX, y + 3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text(
      `Sistema Bomberos  |  ${CHECKLIST_CATEGORY_LABELS[item.category]}`,
      titleX,
      y + 9.5
    );
    y += 18;
    doc.setDrawColor(220, 38, 38);
    doc.setLineWidth(0.8);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 8;

    // --- Equipo -----------------------------------------------------------
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text("EQUIPO", MARGIN, y);
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(20);
    const nameLines = doc.splitTextToSize(item.name, CONTENT_W) as string[];
    doc.text(nameLines, MARGIN, y);
    y += 6 * nameLines.length;
    if (item.detail) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100);
      const detailLines = doc.splitTextToSize(item.detail, CONTENT_W) as string[];
      doc.text(detailLines, MARGIN, y);
      y += 5 * detailLines.length;
    }
    y += 4;

    // --- Estado, quién inspeccionó y cuándo --------------------------------
    const pillColor: [number, number, number] = item.status
      ? STATUS_RGB[item.status]
      : [120, 120, 120];
    doc.setFillColor(pillColor[0], pillColor[1], pillColor[2]);
    doc.roundedRect(MARGIN, y, 50, 9, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255);
    doc.text(
      item.status ? CHECKLIST_STATUS_LABELS[item.status] : "Sin inspeccionar",
      MARGIN + 25,
      y + 6,
      { align: "center" }
    );

    const col2 = MARGIN + 56;
    const col3 = MARGIN + 126;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text("INSPECCIONÓ", col2, y + 2);
    doc.text("FECHA Y HORA", col3, y + 2);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(20);
    const inspector = item.inspected_by_name || "";
    doc.text(inspector || "______________________", col2, y + 8, { maxWidth: 66 });
    doc.text(
      item.inspected_at ? formatDateTime(item.inspected_at) : "____/____/______  ____:____",
      col3,
      y + 8,
      { maxWidth: 56 }
    );
    y += 16;

    // --- Tabla de puntos ----------------------------------------------------
    const noCount = points.filter((p) => answers[p.id] === "no").length;
    if (points.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text("Este equipo no tiene un checklist de puntos armado.", MARGIN, y + 4);
      y += 12;
    } else {
      const body = points.map((p, i) => [
        String(i + 1),
        p.question,
        answers[p.id] === "si" ? "X" : "",
        answers[p.id] === "no" ? "X" : "",
        answers[p.id] === "na" ? "X" : "",
      ]);
      autoTable(doc, {
        startY: y,
        head: [["N°", "Punto a revisar", "Sí", "No", "No aplica"]],
        body,
        theme: "grid",
        margin: { left: MARGIN, right: MARGIN, top: 16, bottom: 22 },
        styles: {
          fontSize: 9,
          cellPadding: 1.9,
          valign: "middle",
          lineColor: [200, 200, 200],
          lineWidth: 0.2,
          textColor: 30,
        },
        headStyles: { fillColor: [220, 38, 38], textColor: 255, halign: "center" },
        columnStyles: {
          0: { cellWidth: 12, halign: "center" },
          1: { cellWidth: "auto", halign: "left" },
          2: { cellWidth: 16, halign: "center" },
          3: { cellWidth: 16, halign: "center" },
          4: { cellWidth: 22, halign: "center" },
        },
        didParseCell: (data) => {
          if (data.section === "head" && data.column.index === 1) {
            data.cell.styles.halign = "left";
          }
          if (data.section !== "body") return;
          const mark = data.cell.text[0] === "X";
          if (data.column.index === 2 && mark) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.textColor = [22, 163, 74];
          }
          if (data.column.index === 3 && mark) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.textColor = [185, 28, 28];
            data.cell.styles.fillColor = [254, 226, 226];
          }
          if (data.column.index === 4 && mark) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.textColor = [90, 90, 90];
          }
        },
        didDrawPage: () => {
          // En las hojas de continuación se repite el nombre del equipo.
          if (doc.getNumberOfPages() > firstPage) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(120);
            doc.text(`${item.name} (continuación)`, MARGIN, 10);
          }
        },
      });
      y = (lastTableY() ?? y) + 6;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(noCount > 0 ? 185 : 90, noCount > 0 ? 28 : 90, noCount > 0 ? 28 : 90);
      const answeredCount = points.filter((p) => answers[p.id]).length;
      doc.text(
        answeredCount === 0
          ? "Sin respuestas cargadas."
          : `Puntos con problema: ${noCount} de ${points.length}`,
        MARGIN,
        y
      );
      y += 8;
    }

    // --- Observaciones y firma ---------------------------------------------
    // Se necesita lugar para observaciones + firma; si no hay, pasa a otra hoja.
    const noteLinesEstimate = item.note
      ? Math.ceil((item.note.length * 2) / CONTENT_W) + 1
      : 0;
    const spaceNeeded = (item.note ? 8 + 5 * noteLinesEstimate : 30) + 26;
    if (y + spaceNeeded > BOTTOM_LIMIT) {
      doc.addPage();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`${item.name} (continuación)`, MARGIN, 10);
      y = 20;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text("OBSERVACIONES", MARGIN, y);
    y += 5;
    doc.setDrawColor(200);
    doc.setLineWidth(0.2);
    if (item.note) {
      doc.setFontSize(10);
      doc.setTextColor(30);
      const noteLines = doc.splitTextToSize(item.note, CONTENT_W) as string[];
      doc.text(noteLines, MARGIN, y);
      y += 5 * noteLines.length + 3;
    } else {
      for (let i = 0; i < 3; i++) {
        y += 7;
        doc.line(MARGIN, y, PAGE_W - MARGIN, y);
      }
      y += 4;
    }

    y += 16;
    doc.setDrawColor(60);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, y, MARGIN + 75, y);
    doc.line(MARGIN + 100, y, PAGE_W - MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text("Firma del inspector", MARGIN, y + 4);
    doc.text("Aclaración", MARGIN + 100, y + 4);
    if (inspector) {
      doc.setFontSize(9);
      doc.setTextColor(30);
      doc.text(inspector, MARGIN + 100, y - 2, { maxWidth: CONTENT_W - 100 });
    }
  });

  // --- Pie de página en todas las hojas ----------------------------------
  const totalPages = doc.getNumberOfPages();
  const generated = `Generado el ${formatDateTime(new Date())}${
    opts.generatedBy ? ` por ${opts.generatedBy}` : ""
  }  |  Sistema Bomberos`;
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(generated, MARGIN, FOOTER_Y);
    doc.text(`Página ${page} de ${totalPages}`, PAGE_W - MARGIN, FOOTER_Y, { align: "right" });
  }

  return doc;
}

/** Genera el PDF y lo devuelve como archivo listo para descargar o compartir. */
export async function createChecklistPdfFile(
  entries: ChecklistPdfEntry[],
  opts: ChecklistPdfOptions = {}
) {
  const doc = await buildChecklistPdf(entries, opts);
  const blob = doc.output("blob");
  const filename = checklistPdfFilename(entries);
  return { blob, filename, file: new File([blob], filename, { type: "application/pdf" }) };
}
