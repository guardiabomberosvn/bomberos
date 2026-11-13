"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { CHECKLIST_TEMPLATES } from "@/lib/checklistTemplates";
import {
  createChecklistPdfFile,
  loadLogoDataUrl,
  preloadPdfLibraries,
  type ChecklistPdfEntry,
} from "@/lib/checklistPdf";
import {
  CHECKLIST_ANSWER_LABELS,
  CHECKLIST_CATEGORY_LABELS,
  CHECKLIST_STATUS_LABELS,
  type ChecklistAnswer,
  type ChecklistCategory,
  type ChecklistItem,
  type ChecklistPoint,
  type ChecklistStatus,
  type Profile,
} from "@/lib/types";

const CATEGORIES: ChecklistCategory[] = [
  "vehiculos",
  "maquinas",
  "equipamiento",
  "herramientas",
];

// Colores del semáforo. Se usan tanto en las insignias como en los botones
// grandes de la inspección.
const STATUS_STYLES: Record<
  ChecklistStatus,
  { dot: string; badge: string; button: string; emoji: string }
> = {
  verde: {
    dot: "bg-green-600",
    badge: "bg-green-50 text-green-800 border-green-200",
    button: "border-green-600 bg-green-600 text-white",
    emoji: "🟢",
  },
  amarillo: {
    dot: "bg-yellow-500",
    badge: "bg-yellow-50 text-yellow-800 border-yellow-300",
    button: "border-yellow-500 bg-yellow-500 text-white",
    emoji: "🟡",
  },
  rojo: {
    dot: "bg-red-600",
    badge: "bg-red-50 text-red-800 border-red-200",
    button: "border-red-600 bg-red-600 text-white",
    emoji: "🔴",
  },
};

// Botones Sí / No / No aplica de cada punto.
const ANSWER_SELECTED: Record<ChecklistAnswer, string> = {
  si: "border-green-600 bg-green-600 text-white",
  no: "border-red-600 bg-red-600 text-white",
  na: "border-neutral-500 bg-neutral-500 text-white",
};
const ANSWERS: ChecklistAnswer[] = ["si", "no", "na"];

// Para ordenar: lo más urgente primero.
const STATUS_ORDER: Record<string, number> = {
  rojo: 0,
  amarillo: 1,
  sin: 2,
  verde: 3,
};

type Filter = "todos" | ChecklistStatus | "sin";

function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Panel de inspección: responder los puntos del equipo (Sí / No / No aplica)
// y elegir el color final. Guardar PISA la inspección anterior.
// ---------------------------------------------------------------------------
function InspectPanel({
  item,
  points,
  profile,
  onDone,
  onCancel,
}: {
  item: ChecklistItem;
  points: ChecklistPoint[];
  profile: Profile;
  onDone: () => void;
  onCancel: () => void;
}) {
  // Arranca con las respuestas de la inspección anterior (si las hay), para
  // ir corrigiendo solo lo que cambió. Para empezar de cero está "Limpiar".
  const [answers, setAnswers] = useState<Record<string, ChecklistAnswer>>(() => {
    const previous = item.answers ?? {};
    const initial: Record<string, ChecklistAnswer> = {};
    points.forEach((p) => {
      if (previous[p.id]) initial[p.id] = previous[p.id];
    });
    return initial;
  });
  const [chosenStatus, setChosenStatus] = useState<ChecklistStatus | null>(null);
  const [note, setNote] = useState(item.status && item.status !== "verde" ? item.note ?? "" : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answeredCount = points.filter((p) => answers[p.id]).length;
  const unanswered = points.length - answeredCount;
  const anyNo = points.some((p) => answers[p.id] === "no");

  // Color sugerido según las respuestas — pero lo decide el que inspecciona.
  const suggested: ChecklistStatus | null =
    points.length === 0 ? null : anyNo ? "amarillo" : unanswered === 0 ? "verde" : null;
  const effective = chosenStatus ?? suggested;
  const needsNote = effective === "amarillo" || effective === "rojo";

  const handleSave = async () => {
    if (unanswered > 0) {
      setError(`Falta responder ${unanswered} punto(s).`);
      return;
    }
    if (!effective) {
      setError("Elegí cómo queda el equipo: verde, amarillo o rojo.");
      return;
    }
    if (needsNote && !note.trim()) {
      setError("Contá brevemente qué pasa con el equipo (obligatorio en amarillo y rojo).");
      return;
    }
    setError(null);
    setSaving(true);
    const cleanAnswers: Record<string, ChecklistAnswer> = {};
    points.forEach((p) => {
      if (answers[p.id]) cleanAnswers[p.id] = answers[p.id];
    });
    const { error: updateError } = await supabase
      .from("checklist_items")
      .update({
        status: effective,
        note: note.trim() || null,
        answers: cleanAnswers,
        inspected_by: profile.id,
        inspected_by_name: profile.full_name,
        inspected_at: new Date().toISOString(),
      })
      .eq("id", item.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onDone();
  };

  return (
    <div className="mt-4 space-y-4 border-t border-neutral-100 pt-4">
      <p className="text-sm font-medium text-neutral-700">
        Inspección de {item.name}. Al guardar, reemplaza la inspección anterior.
      </p>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {points.length === 0 ? (
        <p className="rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
          Este equipo todavía no tiene puntos a revisar. Podés elegir el color directamente, o
          pedirle a un admin o jefatura que arme el checklist con &quot;Editar checklist&quot;.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
          {points.map((p, index) => (
            <li key={p.id} className="space-y-2 px-3 py-3">
              <p className="text-sm text-neutral-800">
                <span className="mr-1 text-neutral-400">{index + 1}.</span>
                {p.question}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {ANSWERS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, [p.id]: a }))}
                    className={`rounded-md border-2 px-2 py-2 text-sm font-semibold transition-colors ${
                      answers[p.id] === a
                        ? ANSWER_SELECTED[a]
                        : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
                    }`}
                  >
                    {CHECKLIST_ANSWER_LABELS[a]}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {points.length > 0 && (
        <p className="text-xs text-neutral-500">
          Respondidos: {answeredCount} de {points.length}
        </p>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium text-neutral-700">
          ¿Cómo queda el equipo?
          {suggested && !chosenStatus && (
            <span className="ml-1 text-xs font-normal text-neutral-500">
              (sugerido según tus respuestas, podés cambiarlo)
            </span>
          )}
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {(["verde", "amarillo", "rojo"] as ChecklistStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setChosenStatus(s)}
              className={`rounded-lg border-2 px-3 py-3 text-sm font-semibold transition-colors ${
                effective === s
                  ? STATUS_STYLES[s].button
                  : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              {STATUS_STYLES[s].emoji} {CHECKLIST_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder={needsNote ? "¿Qué pasa con el equipo? (obligatorio)" : "Nota (opcional)"}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar inspección"}
        </button>
        <button
          onClick={onCancel}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor del checklist de un equipo (admin / jefatura): armar y modificar
// los puntos a revisar. Estos puntos NO se borran al inspeccionar de nuevo.
// ---------------------------------------------------------------------------
function EditPanel({
  item,
  points,
  allItems,
  allPoints,
  organizationId,
  onChanged,
  onClose,
}: {
  item: ChecklistItem;
  points: ChecklistPoint[];
  allItems: ChecklistItem[];
  allPoints: ChecklistPoint[];
  organizationId: string;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [newQuestion, setNewQuestion] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [copyFromId, setCopyFromId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const nextOrder = points.length > 0 ? Math.max(...points.map((p) => p.sort_order)) + 1 : 0;

  const reportError = (message: string) => {
    setInfo(null);
    setError(message);
  };

  const insertQuestions = async (questions: string[]) => {
    const rows = questions.map((q, i) => ({
      organization_id: organizationId,
      item_id: item.id,
      question: q,
      sort_order: nextOrder + i,
    }));
    const { error: insertError } = await supabase.from("checklist_points").insert(rows);
    if (insertError) {
      reportError(insertError.message);
      return false;
    }
    onChanged();
    return true;
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim()) return;
    setError(null);
    setInfo(null);
    if (await insertQuestions([newQuestion.trim()])) setNewQuestion("");
  };

  const handleRename = async (p: ChecklistPoint, value: string) => {
    const text = value.trim();
    if (!text || text === p.question) return;
    setError(null);
    const { error: updateError } = await supabase
      .from("checklist_points")
      .update({ question: text })
      .eq("id", p.id);
    if (updateError) reportError(updateError.message);
    onChanged();
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= points.length) return;
    setError(null);
    const reordered = [...points];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const results = await Promise.all(
      reordered.map((p, i) =>
        p.sort_order === i
          ? Promise.resolve({ error: null })
          : supabase.from("checklist_points").update({ sort_order: i }).eq("id", p.id)
      )
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) reportError(failed.error.message);
    onChanged();
  };

  const handleDelete = async (p: ChecklistPoint) => {
    if (!window.confirm(`¿Eliminar este punto del checklist?\n\n"${p.question}"`)) return;
    setError(null);
    const { error: deleteError } = await supabase
      .from("checklist_points")
      .delete()
      .eq("id", p.id);
    if (deleteError) reportError(deleteError.message);
    onChanged();
  };

  const handleLoadTemplate = async () => {
    const template = CHECKLIST_TEMPLATES.find((t) => t.key === templateKey);
    if (!template) return;
    setError(null);
    if (await insertQuestions(template.questions)) {
      setInfo(`Se agregaron ${template.questions.length} puntos del modelo. Editalos a tu gusto.`);
      setTemplateKey("");
    }
  };

  const handleCopy = async () => {
    const source = allItems.find((i) => i.id === copyFromId);
    if (!source) return;
    const sourcePoints = allPoints
      .filter((p) => p.item_id === source.id)
      .sort((a, b) => a.sort_order - b.sort_order);
    if (sourcePoints.length === 0) return;
    setError(null);
    if (await insertQuestions(sourcePoints.map((p) => p.question))) {
      setInfo(`Se copiaron ${sourcePoints.length} puntos de ${source.name}.`);
      setCopyFromId("");
    }
  };

  // Modelos: primero los de la misma categoría que el equipo.
  const templatesSorted = [...CHECKLIST_TEMPLATES].sort(
    (a, b) => Number(b.category === item.category) - Number(a.category === item.category)
  );
  const copyCandidates = allItems.filter(
    (i) => i.id !== item.id && allPoints.some((p) => p.item_id === i.id)
  );

  return (
    <div className="mt-4 space-y-4 border-t border-neutral-100 pt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-neutral-700">
          Checklist de {item.name}: puntos a revisar
        </p>
        <button
          onClick={onClose}
          className="text-sm text-neutral-500 hover:text-neutral-800"
        >
          Cerrar
        </button>
      </div>
      <p className="text-xs text-neutral-500">
        Cada punto se responde con Sí, No o No aplica al inspeccionar. Los puntos quedan
        guardados: no se borran al volver a inspeccionar. Tocá el texto de un punto para
        corregirlo.
      </p>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {info && (
        <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{info}</div>
      )}

      {points.length === 0 ? (
        <p className="rounded-md bg-neutral-50 px-3 py-3 text-sm text-neutral-500">
          Todavía no hay puntos. Agregá el primero abajo, o cargá un modelo sugerido.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
          {points.map((p, index) => (
            <li key={`${p.id}-${p.question}`} className="flex items-center gap-2 px-2 py-2">
              <span className="w-6 text-center text-xs text-neutral-400">{index + 1}</span>
              <input
                defaultValue={p.question}
                onBlur={(e) => {
                  if (!e.currentTarget.value.trim()) {
                    e.currentTarget.value = p.question;
                    return;
                  }
                  handleRename(p, e.currentTarget.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                className="min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-sm hover:border-neutral-300 focus:border-neutral-400"
              />
              <button
                type="button"
                onClick={() => handleMove(index, -1)}
                disabled={index === 0}
                title="Subir"
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => handleMove(index, 1)}
                disabled={index === points.length - 1}
                title="Bajar"
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => handleDelete(p)}
                title="Eliminar punto"
                className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap gap-2">
        <input
          value={newQuestion}
          onChange={(e) => setNewQuestion(e.target.value)}
          placeholder="Nuevo punto a revisar, ej: Nivel de aceite"
          className="min-w-[200px] flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          + Agregar punto
        </button>
      </form>

      <div className="grid gap-3 rounded-lg bg-neutral-50 p-3 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-600">Cargar un modelo sugerido</p>
          <div className="flex gap-2">
            <select
              value={templateKey}
              onChange={(e) => setTemplateKey(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2 py-2 text-sm"
            >
              <option value="">Elegí un modelo…</option>
              {templatesSorted.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleLoadTemplate}
              disabled={!templateKey}
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
            >
              Cargar
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-600">Copiar los puntos de otro equipo</p>
          <div className="flex gap-2">
            <select
              value={copyFromId}
              onChange={(e) => setCopyFromId(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2 py-2 text-sm"
            >
              <option value="">
                {copyCandidates.length === 0 ? "Ningún equipo tiene puntos todavía" : "Elegí un equipo…"}
              </option>
              {copyCandidates.map((i) => (
                <option key={i.id} value={i.id}>
                  {CHECKLIST_CATEGORY_LABELS[i.category]} · {i.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!copyFromId}
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
            >
              Copiar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChecklistsContent() {
  const { profile } = useAuth();
  const canInspect =
    profile?.role === "admin" || profile?.role === "jefatura" || profile?.role === "guardia";
  const canManage = profile?.role === "admin" || profile?.role === "jefatura";

  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [points, setPoints] = useState<ChecklistPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [category, setCategory] = useState<ChecklistCategory>("vehiculos");
  const [filter, setFilter] = useState<Filter>("todos");
  const [search, setSearch] = useState("");

  // Alta de equipos nuevos (admin / jefatura)
  const [newName, setNewName] = useState("");
  const [newDetail, setNewDetail] = useState("");

  // Qué equipo tiene abierto el panel de inspección o el de edición.
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // PDF: equipos tildados para descargar/compartir. La selección se mantiene
  // aunque se cambie de pestaña, así se pueden juntar equipos de varias listas.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pdfBusy, setPdfBusy] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const logoRef = useRef<string | null>(null);

  const load = async () => {
    const [itemsRes, pointsRes] = await Promise.all([
      supabase.from("checklist_items").select("*").order("name"),
      supabase.from("checklist_points").select("*").order("sort_order"),
    ]);
    if (itemsRes.error) setError(itemsRes.error.message);
    else if (pointsRes.error) setError(pointsRes.error.message);
    setItems((itemsRes.data as ChecklistItem[]) ?? []);
    setPoints((pointsRes.data as ChecklistPoint[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("checklists")
      .on("postgres_changes", { event: "*", schema: "public", table: "checklist_items" }, () =>
        load()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "checklist_points" }, () =>
        load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Detecta si el dispositivo puede compartir archivos (celulares), y deja
  // listas de antemano las librerías del PDF y el escudo, para que el PDF
  // salga enseguida al tocar el botón.
  useEffect(() => {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.canShare === "function") {
        const probe = new File(["x"], "x.pdf", { type: "application/pdf" });
        setCanShareFiles(navigator.canShare({ files: [probe] }));
      }
    } catch {
      setCanShareFiles(false);
    }
    preloadPdfLibraries().catch(() => {});
    loadLogoDataUrl().then((dataUrl) => {
      logoRef.current = dataUrl;
    });
  }, []);

  const pointsByItem = useMemo(() => {
    const map = new Map<string, ChecklistPoint[]>();
    points.forEach((p) => {
      const list = map.get(p.item_id) ?? [];
      list.push(p);
      map.set(p.item_id, list);
    });
    map.forEach((list) => list.sort((a, b) => a.sort_order - b.sort_order));
    return map;
  }, [points]);

  const inCategory = useMemo(
    () => items.filter((i) => i.category === category && (canManage || i.is_active)),
    [items, category, canManage]
  );

  const counts = useMemo(() => {
    const c = { verde: 0, amarillo: 0, rojo: 0, sin: 0 };
    inCategory.forEach((i) => {
      if (!i.is_active) return;
      c[i.status ?? "sin"] += 1;
    });
    return c;
  }, [inCategory]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inCategory
      .filter((i) => (filter === "todos" ? true : (i.status ?? "sin") === filter))
      .filter(
        (i) => !q || i.name.toLowerCase().includes(q) || (i.detail ?? "").toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const diff = STATUS_ORDER[a.status ?? "sin"] - STATUS_ORDER[b.status ?? "sin"];
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      });
  }, [inCategory, filter, search]);

  // --- PDF ------------------------------------------------------------------
  // Solo cuentan los equipos que siguen existiendo (por si se borró alguno).
  const selectedIds = items.filter((i) => selected.has(i.id)).map((i) => i.id);
  const allVisibleSelected = visible.length > 0 && visible.every((i) => selected.has(i.id));

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      visible.forEach((i) => {
        if (allVisibleSelected) next.delete(i.id);
        else next.add(i.id);
      });
      return next;
    });

  // Arma el PDF con los equipos pedidos, ordenados por lista y nombre.
  const makePdf = async (ids: string[]) => {
    const idSet = new Set(ids);
    const entries: ChecklistPdfEntry[] = items
      .filter((i) => idSet.has(i.id))
      .sort(
        (a, b) =>
          CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) ||
          a.name.localeCompare(b.name)
      )
      .map((item) => ({ item, points: pointsByItem.get(item.id) ?? [] }));
    if (entries.length === 0) return null;
    const result = await createChecklistPdfFile(entries, {
      logoDataUrl: logoRef.current,
      generatedBy: profile?.full_name ?? null,
    });
    return { ...result, count: entries.length };
  };

  const saveBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const handleDownloadPdf = async (ids: string[]) => {
    if (pdfBusy || ids.length === 0) return;
    setError(null);
    setInfo(null);
    setPdfBusy(true);
    try {
      const result = await makePdf(ids);
      if (!result) return;
      saveBlob(result.blob, result.filename);
      setInfo(`Se descargó el PDF: ${result.filename}`);
    } catch {
      setError("No se pudo generar el PDF. Probá de nuevo.");
    } finally {
      setPdfBusy(false);
    }
  };

  // Compartir (celulares): abre el menú para mandar el PDF por WhatsApp, mail,
  // etc. Si el dispositivo no lo permite, lo descarga.
  const handleSharePdf = async (ids: string[]) => {
    if (pdfBusy || ids.length === 0) return;
    setError(null);
    setInfo(null);
    setPdfBusy(true);
    try {
      const result = await makePdf(ids);
      if (!result) return;
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [result.file] })) {
        try {
          await navigator.share({ files: [result.file], title: result.filename });
        } catch (shareError) {
          // Si la persona cierra el menú de compartir no es un error.
          if ((shareError as { name?: string }).name !== "AbortError") {
            setError("No se pudo compartir el PDF. Probá descargarlo.");
          }
        }
      } else {
        saveBlob(result.blob, result.filename);
        setInfo(`Este dispositivo no permite compartir; se descargó el PDF: ${result.filename}`);
      }
    } catch {
      setError("No se pudo generar el PDF. Probá de nuevo.");
    } finally {
      setPdfBusy(false);
    }
  };

  const switchCategory = (c: ChecklistCategory) => {
    setCategory(c);
    setFilter("todos");
    setSearch("");
    setInspectingId(null);
    setEditingId(null);
    setError(null);
    setInfo(null);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !profile) return;
    setError(null);
    setInfo(null);
    const { error: insertError } = await supabase.from("checklist_items").insert({
      organization_id: profile.organization_id,
      category,
      name: newName.trim(),
      detail: newDetail.trim() || null,
    });
    if (insertError) {
      setError(
        insertError.message.includes("checklist_items_organization_id_category_name_key")
          ? "Ya hay un equipo cargado con ese nombre en esta lista."
          : insertError.message
      );
      return;
    }
    setNewName("");
    setNewDetail("");
    load();
  };

  // Trae los vehículos que ya están cargados en Flota como ítems de
  // "Máquinas" (solo los que todavía no estén).
  const handleImportVehicles = async () => {
    if (!profile) return;
    setError(null);
    setInfo(null);
    const { data: vehicles, error: vError } = await supabase
      .from("vehicles")
      .select("name, type")
      .eq("is_active", true);
    if (vError) {
      setError(vError.message);
      return;
    }
    const existing = new Set(
      items.filter((i) => i.category === "vehiculos").map((i) => i.name.trim().toLowerCase())
    );
    // Si en Flota hay dos vehículos con el mismo nombre, se trae uno solo
    // (la lista no admite nombres repetidos) y se avisa.
    const seen = new Set(existing);
    let repeated = 0;
    const toInsert: {
      organization_id: string;
      category: "vehiculos";
      name: string;
      detail: string | null;
    }[] = [];
    (vehicles ?? []).forEach((v) => {
      const name = String(v.name ?? "").trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (seen.has(key)) {
        if (!existing.has(key)) repeated += 1;
        return;
      }
      seen.add(key);
      toInsert.push({
        organization_id: profile.organization_id,
        category: "vehiculos",
        name,
        detail: v.type ?? null,
      });
    });
    if (toInsert.length === 0) {
      setInfo("No hay vehículos nuevos para traer: todos los de Flota ya están en la lista.");
      return;
    }
    const { error: insertError } = await supabase.from("checklist_items").insert(toInsert);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setInfo(
      `Se agregaron ${toInsert.length} vehículo(s) desde Flota.` +
        (repeated > 0
          ? ` Se salteó ${repeated} porque en Flota tiene el mismo nombre que otro; podés cargarlo a mano con un nombre distinto.`
          : "")
    );
    load();
  };

  const startInspecting = (item: ChecklistItem) => {
    setEditingId(null);
    setInspectingId(item.id);
    setError(null);
    setInfo(null);
  };

  const startEditing = (item: ChecklistItem) => {
    setInspectingId(null);
    setEditingId(editingId === item.id ? null : item.id);
    setError(null);
    setInfo(null);
  };

  // Limpiar: borra las respuestas y el resultado, y deja el equipo como "Sin
  // inspeccionar" para empezar una inspección nueva de cero. Los puntos del
  // checklist (las preguntas) NO se tocan.
  const handleClear = async (item: ChecklistItem) => {
    if (
      !window.confirm(
        `¿Limpiar la inspección de "${item.name}"?\n\nSe borran las respuestas y el resultado, y el equipo queda como "Sin inspeccionar". Las preguntas del checklist no se tocan.`
      )
    )
      return;
    setError(null);
    const { error: updateError } = await supabase
      .from("checklist_items")
      .update({
        status: null,
        note: null,
        answers: {},
        inspected_by: null,
        inspected_by_name: null,
        inspected_at: null,
      })
      .eq("id", item.id);
    if (updateError) setError(updateError.message);
    load();
  };

  const handleToggleActive = async (item: ChecklistItem) => {
    const { error: updateError } = await supabase
      .from("checklist_items")
      .update({ is_active: !item.is_active })
      .eq("id", item.id);
    if (updateError) setError(updateError.message);
    load();
  };

  const handleDelete = async (item: ChecklistItem) => {
    if (
      !window.confirm(
        `¿Eliminar "${item.name}" de la lista? Se borra también su checklist. No se puede deshacer.`
      )
    )
      return;
    const { error: deleteError } = await supabase
      .from("checklist_items")
      .delete()
      .eq("id", item.id);
    if (deleteError) setError(deleteError.message);
    load();
  };

  const filterButtons: { key: Filter; label: string; count: number | null }[] = [
    { key: "todos", label: "Todos", count: null },
    { key: "rojo", label: "🔴 Fuera de servicio", count: counts.rojo },
    { key: "amarillo", label: "🟡 Mantenimiento", count: counts.amarillo },
    { key: "verde", label: "🟢 Todo bien", count: counts.verde },
    { key: "sin", label: "⚪ Sin inspeccionar", count: counts.sin },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Checklists</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Cada equipo tiene su propio checklist de puntos a revisar (Sí / No / No aplica) y un
          semáforo con el resultado de la última inspección. Verde: todo bien. Amarillo: necesita
          mantenimiento. Rojo: fuera de servicio. Para volver a empezar una inspección de cero,
          usá &quot;Limpiar&quot;.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => switchCategory(c)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              category === c
                ? "bg-brand text-white shadow-sm"
                : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100"
            }`}
          >
            {CHECKLIST_CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {info && (
        <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{info}</div>
      )}

      {canManage && (
        <form
          onSubmit={handleAdd}
          className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4"
        >
          <p className="text-sm font-medium text-neutral-700">
            Agregar a {CHECKLIST_CATEGORY_LABELS[category].toLowerCase()}
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre, ej: Autobomba 1"
              required
              className="min-w-[180px] flex-1 rounded-md border border-neutral-300 px-3 py-2"
            />
            <input
              value={newDetail}
              onChange={(e) => setNewDetail(e.target.value)}
              placeholder="Detalle o ubicación (opcional)"
              className="min-w-[180px] flex-1 rounded-md border border-neutral-300 px-3 py-2"
            />
            <button
              type="submit"
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
            >
              + Agregar
            </button>
          </div>
          {category === "vehiculos" && (
            <button
              type="button"
              onClick={handleImportVehicles}
              className="text-sm font-medium text-brand hover:underline"
            >
              Traer los vehículos que ya están en Flota
            </button>
          )}
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {filterButtons.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.key
                ? "border-neutral-800 bg-neutral-800 text-white"
                : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100"
            }`}
          >
            {f.label}
            {f.count !== null ? ` (${f.count})` : ""}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar…"
          className="ml-auto w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm sm:w-56"
        />
      </div>

      {!loading && visible.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-neutral-200 bg-white px-4 py-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectVisible}
              className="h-4 w-4"
            />
            Seleccionar todos los de esta lista
          </label>
          <span className="text-sm text-neutral-500">
            {selectedIds.length === 0
              ? "Tildá uno o más equipos para pasarlos a PDF"
              : `${selectedIds.length} seleccionado${selectedIds.length === 1 ? "" : "s"} en total`}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            {selectedIds.length > 0 && (
              <button
                onClick={() => setSelected(new Set())}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
              >
                Quitar selección
              </button>
            )}
            <button
              onClick={() => handleDownloadPdf(selectedIds)}
              disabled={selectedIds.length === 0 || pdfBusy}
              className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-40"
            >
              {pdfBusy ? "Generando…" : "Descargar PDF"}
              {!pdfBusy && selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
            </button>
            {canShareFiles && (
              <button
                onClick={() => handleSharePdf(selectedIds)}
                disabled={selectedIds.length === 0 || pdfBusy}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
              >
                Compartir
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-neutral-500">Cargando…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500">
          {inCategory.length === 0
            ? canManage
              ? "Todavía no cargaste nada en esta lista. Agregá el primero arriba."
              : "Todavía no hay nada cargado en esta lista."
            : "No hay equipos con ese filtro."}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((item) => {
            const style = item.status ? STATUS_STYLES[item.status] : null;
            const itemPoints = pointsByItem.get(item.id) ?? [];
            const answers = item.answers ?? {};
            const problems = itemPoints.filter((p) => answers[p.id] === "no");
            const hasInspection = item.status !== null || Object.keys(answers).length > 0;
            const isInspecting = inspectingId === item.id;
            const isEditing = editingId === item.id;
            return (
              <li
                key={item.id}
                className={`rounded-xl border bg-white p-4 ${
                  item.is_active ? "border-neutral-200" : "border-dashed border-neutral-300 opacity-60"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggleSelected(item.id)}
                      aria-label={`Seleccionar ${item.name} para el PDF`}
                      className="mt-1 h-4 w-4 shrink-0"
                    />
                    <span
                      className={`mt-1 h-4 w-4 shrink-0 rounded-full ${
                        style ? style.dot : "bg-neutral-300"
                      }`}
                    />
                    <div>
                      <p className="font-medium text-neutral-900">
                        {item.name}
                        {!item.is_active && (
                          <span className="ml-2 text-xs font-normal text-neutral-500">(oculto)</span>
                        )}
                      </p>
                      {item.detail && <p className="text-xs text-neutral-500">{item.detail}</p>}
                      <p className="mt-1 flex flex-wrap items-center gap-2">
                        {style && item.status ? (
                          <span
                            className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${style.badge}`}
                          >
                            {CHECKLIST_STATUS_LABELS[item.status]}
                          </span>
                        ) : (
                          <span className="inline-block rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs font-medium text-neutral-600">
                            Sin inspeccionar
                          </span>
                        )}
                        <span className="text-xs text-neutral-400">
                          {itemPoints.length === 0
                            ? "Sin checklist armado"
                            : `Checklist: ${itemPoints.length} punto${itemPoints.length === 1 ? "" : "s"}`}
                        </span>
                      </p>
                      {problems.length > 0 && (
                        <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                          <p className="text-xs font-semibold uppercase tracking-wide">
                            Puntos con problema
                          </p>
                          <ul className="mt-1 list-disc pl-5">
                            {problems.map((p) => (
                              <li key={p.id}>{p.question}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {item.note && (
                        <p className="mt-1 text-sm text-neutral-700">{item.note}</p>
                      )}
                      {item.inspected_at && (
                        <p className="mt-1 text-xs text-neutral-400">
                          Inspeccionó: {item.inspected_by_name || "sin nombre"} ·{" "}
                          {formatDate(item.inspected_at)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleDownloadPdf([item.id])}
                      disabled={pdfBusy}
                      title="Descargar este checklist en PDF"
                      className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
                    >
                      PDF
                    </button>
                    {canInspect && item.is_active && !isInspecting && (
                      <button
                        onClick={() => startInspecting(item)}
                        className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark"
                      >
                        Inspeccionar
                      </button>
                    )}
                    {canInspect && hasInspection && (
                      <button
                        onClick={() => handleClear(item)}
                        className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                      >
                        Limpiar
                      </button>
                    )}
                    {canManage && (
                      <>
                        <button
                          onClick={() => startEditing(item)}
                          className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                        >
                          {isEditing ? "Cerrar checklist" : "Editar checklist"}
                        </button>
                        <button
                          onClick={() => handleToggleActive(item)}
                          className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                        >
                          {item.is_active ? "Ocultar" : "Mostrar"}
                        </button>
                        <button
                          onClick={() => handleDelete(item)}
                          className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          Eliminar
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isInspecting && profile && (
                  <InspectPanel
                    item={item}
                    points={itemPoints}
                    profile={profile}
                    onDone={() => {
                      setInspectingId(null);
                      load();
                    }}
                    onCancel={() => setInspectingId(null)}
                  />
                )}

                {isEditing && profile && (
                  <EditPanel
                    item={item}
                    points={itemPoints}
                    allItems={items}
                    allPoints={points}
                    organizationId={profile.organization_id}
                    onChanged={load}
                    onClose={() => setEditingId(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function ChecklistsPage() {
  return (
    <ProtectedRoute section="checklists">
      <AppShell>
        <ChecklistsContent />
      </AppShell>
    </ProtectedRoute>
  );
}
