"use client";

/**
 * Gráfico de barras horizontales simple, sin dependencias externas.
 * Pensado para paneles de estadísticas chicos (por categoría, por barrio,
 * por mes, etc).
 */
export function StatsBarChart({
  data,
  color = "bg-brand",
  emptyText = "Sin datos todavía.",
}: {
  data: { label: string; value: number }[];
  color?: string;
  emptyText?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  if (data.length === 0) {
    return <p className="text-sm text-neutral-400">{emptyText}</p>;
  }

  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2 text-sm">
          <span
            className="w-28 shrink-0 truncate text-neutral-600 sm:w-40"
            title={d.label}
          >
            {d.label}
          </span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-neutral-100">
            <div
              className={`h-full rounded ${color}`}
              style={{ width: `${d.value === 0 ? 0 : (d.value / max) * 100}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right font-medium text-neutral-800">
            {d.value}
          </span>
        </div>
      ))}
    </div>
  );
}
