"use client";

import { useState } from "react";

// Editor de lista de nombres sin límite (ej: "A cargo", "Personal que
// concurrió"): se van agregando de a uno con "+ Agregar" y se pueden
// quitar. Se usa en Intervenciones para los campos del parte que en el
// papel tienen 2-3 renglones pero en la práctica pueden necesitar más.
export function NameListEditor({
  values,
  onChange,
  placeholder = "Nombre…",
  className = "",
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState("");

  const addValue = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onChange([...values, trimmed]);
    setDraft("");
  };

  const removeValue = (idx: number) => {
    onChange(values.filter((_, i) => i !== idx));
  };

  return (
    <div className={className}>
      {values.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {values.map((v, idx) => (
            <li
              key={`${v}-${idx}`}
              className="flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700"
            >
              {v}
              <button
                type="button"
                onClick={() => removeValue(idx)}
                className="font-bold text-neutral-400 hover:text-red-600"
                aria-label={`Quitar ${v}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addValue();
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={addValue}
          className="shrink-0 rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          + Agregar
        </button>
      </div>
    </div>
  );
}
