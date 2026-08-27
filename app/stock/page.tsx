"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { StatsBarChart } from "@/components/StatsBarChart";
import { supabase } from "@/lib/supabase";
import { exportMultiSheetExcel } from "@/lib/export";
import type { StockItem, StockWithdrawal } from "@/lib/types";

type SubTab = "stock" | "retiros";

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function StockContent() {
  const { profile } = useAuth();
  const [subTab, setSubTab] = useState<SubTab>("stock");
  const [items, setItems] = useState<StockItem[]>([]);
  const [withdrawals, setWithdrawals] = useState<StockWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(true);

  // --- form: nuevo insumo ---
  const [showItemForm, setShowItemForm] = useState(false);
  const [itemName, setItemName] = useState("");
  const [itemUnit, setItemUnit] = useState("unidades");
  const [itemInitialStock, setItemInitialStock] = useState("");
  const [itemMinStock, setItemMinStock] = useState("");

  // --- edición de insumo (recargar stock / mínimo) ---
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [editInitialStock, setEditInitialStock] = useState("");
  const [editMinStock, setEditMinStock] = useState("");

  // --- form: nuevo retiro ---
  const [showWithdrawalForm, setShowWithdrawalForm] = useState(false);
  const [wItemId, setWItemId] = useState("");
  const [wQuantity, setWQuantity] = useState("");
  const [wWithdrawnBy, setWWithdrawnBy] = useState("");
  const [wDestination, setWDestination] = useState("");
  const [wNotes, setWNotes] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: i } = await supabase
      .from("stock_items")
      .select("*")
      .eq("is_active", true)
      .order("name");
    const { data: w } = await supabase
      .from("stock_withdrawals")
      .select("*")
      .order("withdrawn_at", { ascending: false })
      .limit(300);
    setItems((i as StockItem[]) ?? []);
    setWithdrawals((w as StockWithdrawal[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const itemsChannel = supabase
      .channel("stock-items")
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_items" }, () => load())
      .subscribe();
    const withdrawalsChannel = supabase
      .channel("stock-withdrawals")
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_withdrawals" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(itemsChannel);
      supabase.removeChannel(withdrawalsChannel);
    };
  }, []);

  const withdrawnByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of withdrawals) {
      map.set(w.item_id, (map.get(w.item_id) ?? 0) + Number(w.quantity));
    }
    return map;
  }, [withdrawals]);

  const currentStock = (item: StockItem) =>
    item.initial_stock - (withdrawnByItem.get(item.id) ?? 0);

  const itemName_ = (id: string) => items.find((i) => i.id === id)?.name ?? "—";
  const itemUnit_ = (id: string) => items.find((i) => i.id === id)?.unit ?? "";

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim() || !profile) return;
    setError(null);

    const { error: insertError } = await supabase.from("stock_items").insert({
      organization_id: profile.organization_id,
      name: itemName.trim(),
      unit: itemUnit.trim() || "unidades",
      initial_stock: itemInitialStock ? Number(itemInitialStock) : 0,
      min_stock: itemMinStock ? Number(itemMinStock) : null,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }
    setItemName("");
    setItemUnit("unidades");
    setItemInitialStock("");
    setItemMinStock("");
    setShowItemForm(false);
    load();
  };

  const openEditItem = (item: StockItem) => {
    setEditInitialStock(String(item.initial_stock));
    setEditMinStock(item.min_stock != null ? String(item.min_stock) : "");
    setEditingItem(item);
  };

  const confirmEditItem = async () => {
    if (!editingItem) return;
    const { error: updateError } = await supabase
      .from("stock_items")
      .update({
        initial_stock: editInitialStock ? Number(editInitialStock) : 0,
        min_stock: editMinStock ? Number(editMinStock) : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editingItem.id);
    if (updateError) setError(updateError.message);
    setEditingItem(null);
    load();
  };

  const handleDeleteItem = async (item: StockItem) => {
    if (
      !window.confirm(
        `¿Dar de baja "${item.name}"? No se borra el historial de retiros, pero deja de aparecer en el listado.`
      )
    ) {
      return;
    }
    const { error: updateError } = await supabase
      .from("stock_items")
      .update({ is_active: false })
      .eq("id", item.id);
    if (updateError) setError(updateError.message);
    load();
  };

  const handleCreateWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wItemId || !wQuantity || !profile) return;
    setError(null);

    const { data: openShift } = await supabase
      .from("guard_shifts")
      .select("id")
      .eq("organization_id", profile.organization_id)
      .is("closed_at", null)
      .maybeSingle();

    const { error: insertError } = await supabase.from("stock_withdrawals").insert({
      organization_id: profile.organization_id,
      item_id: wItemId,
      quantity: Number(wQuantity),
      operator_id: profile.id,
      withdrawn_by: wWithdrawnBy.trim() || null,
      destination: wDestination.trim() || null,
      notes: wNotes.trim() || null,
      shift_id: openShift?.id ?? null,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }
    setWItemId("");
    setWQuantity("");
    setWWithdrawnBy("");
    setWDestination("");
    setWNotes("");
    setShowWithdrawalForm(false);
    load();
  };

  const handleDeleteWithdrawal = async (w: StockWithdrawal) => {
    if (!window.confirm("¿Eliminar este retiro? El stock se recalcula automáticamente.")) return;
    const { error: deleteError } = await supabase.from("stock_withdrawals").delete().eq("id", w.id);
    if (deleteError) setError(deleteError.message);
    load();
  };

  const handleExport = () => {
    exportMultiSheetExcel(
      [
        {
          name: "Stock",
          rows: items.map((i) => ({
            "Mercadería / Insumo": i.name,
            Unidad: i.unit,
            "Stock Inicial/Cargado": i.initial_stock,
            "Retirado (según registro)": withdrawnByItem.get(i.id) ?? 0,
            "Stock Actual": currentStock(i),
          })),
        },
        {
          name: "Registro de retiros",
          rows: withdrawals.map((w) => ({
            Fecha: new Date(w.withdrawn_at).toLocaleDateString("es-AR"),
            Hora: new Date(w.withdrawn_at).toLocaleTimeString("es-AR"),
            "Mercadería / Insumo": itemName_(w.item_id),
            Cantidad: w.quantity,
            Unidad: itemUnit_(w.item_id),
            "Retirado por": w.withdrawn_by ?? "",
            "Destino / Sector": w.destination ?? "",
            Observaciones: w.notes ?? "",
            "Stock Disponible": (() => {
              const item = items.find((i) => i.id === w.item_id);
              return item ? currentStock(item) : "";
            })(),
          })),
        },
      ],
      "control-stock"
    );
  };

  const lowStock = items.filter((i) => i.min_stock != null && currentStock(i) <= i.min_stock);

  const currentYear = new Date().getFullYear();
  const stats = useMemo(() => {
    const thisYear = withdrawals.filter(
      (w) => new Date(w.withdrawn_at).getFullYear() === currentYear
    );
    const qtyByItem = new Map<string, number>();
    for (const w of thisYear) {
      qtyByItem.set(w.item_id, (qtyByItem.get(w.item_id) ?? 0) + Number(w.quantity));
    }
    const topItems = Array.from(qtyByItem.entries())
      .map(([id, value]) => ({ label: itemName_(id), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    const byMonth = MESES.map((label, idx) => ({
      label,
      value: thisYear
        .filter((w) => new Date(w.withdrawn_at).getMonth() === idx)
        .reduce((sum, w) => sum + Number(w.quantity), 0),
    }));

    return { totalWithdrawals: thisYear.length, topItems, byMonth };
  }, [withdrawals, items, currentYear]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-neutral-900">Stock</h1>
        <button
          onClick={handleExport}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          📥 Exportar
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {lowStock.length > 0 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
          <p className="text-sm font-semibold text-orange-900">
            ⚠️ {lowStock.length === 1 ? "1 insumo con stock bajo" : `${lowStock.length} insumos con stock bajo`}
          </p>
          <ul className="mt-1 space-y-0.5 text-sm text-orange-800">
            {lowStock.map((i) => (
              <li key={i.id}>
                {i.name}: {currentStock(i)} {i.unit} (mínimo {i.min_stock})
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-neutral-200 bg-white">
        <button
          onClick={() => setShowStats((s) => !s)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <p className="text-sm font-semibold text-neutral-800">
            📊 Estadísticas {currentYear} · {stats.totalWithdrawals} retiro
            {stats.totalWithdrawals === 1 ? "" : "s"}
          </p>
          <span className="text-xs text-neutral-400">{showStats ? "Ocultar" : "Mostrar"}</span>
        </button>
        {showStats && (
          <div className="grid grid-cols-1 gap-6 border-t border-neutral-100 px-4 py-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">
                Más retirados (cantidad)
              </p>
              <StatsBarChart data={stats.topItems} />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">
                Cantidad retirada por mes
              </p>
              <StatsBarChart data={stats.byMonth} color="bg-orange-500" />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-neutral-200">
        {(
          [
            ["stock", "Stock"],
            ["retiros", "Registro de retiros"],
          ] as [SubTab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setSubTab(value)}
            className={`rounded-t-md px-4 py-2 text-sm font-medium ${
              subTab === value
                ? "border-b-2 border-brand text-brand"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === "stock" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowItemForm((s) => !s)}
              className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
            >
              + Nuevo insumo
            </button>
          </div>

          {showItemForm && (
            <form
              onSubmit={handleCreateItem}
              className="grid grid-cols-1 gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2"
            >
              <input
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="Mercadería / insumo"
                required
                className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
              />
              <input
                value={itemUnit}
                onChange={(e) => setItemUnit(e.target.value)}
                placeholder="Unidad (ej: unidades, litros, cajas)"
                className="rounded-md border border-neutral-300 px-3 py-2"
              />
              <input
                type="number"
                value={itemInitialStock}
                onChange={(e) => setItemInitialStock(e.target.value)}
                placeholder="Stock inicial/cargado"
                className="rounded-md border border-neutral-300 px-3 py-2"
              />
              <input
                type="number"
                value={itemMinStock}
                onChange={(e) => setItemMinStock(e.target.value)}
                placeholder="Stock mínimo (opcional, para alertas)"
                className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
              />
              <button
                type="submit"
                className="rounded-md bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark sm:col-span-2"
              >
                Guardar insumo
              </button>
            </form>
          )}

          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-neutral-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Mercadería / Insumo</th>
                  <th className="px-4 py-2 font-medium">Unidad</th>
                  <th className="px-4 py-2 font-medium">Stock inicial/cargado</th>
                  <th className="px-4 py-2 font-medium">Retirado</th>
                  <th className="px-4 py-2 font-medium">Stock actual</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                      Cargando…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                      Sin insumos cargados todavía.
                    </td>
                  </tr>
                ) : (
                  items.map((i) => {
                    const stock = currentStock(i);
                    const isLow = i.min_stock != null && stock <= i.min_stock;
                    return (
                      <tr key={i.id} className={isLow ? "bg-orange-50" : ""}>
                        <td className="px-4 py-2 text-neutral-800">{i.name}</td>
                        <td className="px-4 py-2 text-neutral-600">{i.unit}</td>
                        <td className="px-4 py-2 text-neutral-600">{i.initial_stock}</td>
                        <td className="px-4 py-2 text-neutral-600">
                          {withdrawnByItem.get(i.id) ?? 0}
                        </td>
                        <td
                          className={`px-4 py-2 font-medium ${
                            isLow ? "text-orange-700" : "text-neutral-800"
                          }`}
                        >
                          {stock}
                          {isLow ? " ⚠️" : ""}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <button
                              onClick={() => openEditItem(i)}
                              className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                            >
                              Recargar / editar
                            </button>
                            <button
                              onClick={() => handleDeleteItem(i)}
                              className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                            >
                              Dar de baja
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === "retiros" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowWithdrawalForm((s) => !s)}
              className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
            >
              + Registrar retiro
            </button>
          </div>

          {items.length === 0 && (
            <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-4 text-center text-sm text-neutral-500">
              Primero cargá algún insumo en la pestaña "Stock".
            </p>
          )}

          {showWithdrawalForm && (
            <form
              onSubmit={handleCreateWithdrawal}
              className="grid grid-cols-1 gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2"
            >
              <select
                value={wItemId}
                onChange={(e) => setWItemId(e.target.value)}
                required
                className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
              >
                <option value="">Mercadería / insumo…</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({currentStock(i)} {i.unit} disponibles)
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={wQuantity}
                onChange={(e) => setWQuantity(e.target.value)}
                placeholder="Cantidad"
                required
                min="0.01"
                step="0.01"
                className="rounded-md border border-neutral-300 px-3 py-2"
              />
              <input
                value={wWithdrawnBy}
                onChange={(e) => setWWithdrawnBy(e.target.value)}
                placeholder="Retirado por"
                className="rounded-md border border-neutral-300 px-3 py-2"
              />
              <input
                value={wDestination}
                onChange={(e) => setWDestination(e.target.value)}
                placeholder="Destino / sector"
                className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
              />
              <input
                value={wNotes}
                onChange={(e) => setWNotes(e.target.value)}
                placeholder="Observaciones (opcional)"
                className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
              />
              <button
                type="submit"
                className="rounded-md bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark sm:col-span-2"
              >
                Registrar retiro
              </button>
            </form>
          )}

          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-neutral-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Fecha</th>
                  <th className="px-4 py-2 font-medium">Insumo</th>
                  <th className="px-4 py-2 font-medium">Cantidad</th>
                  <th className="px-4 py-2 font-medium">Retirado por</th>
                  <th className="px-4 py-2 font-medium">Destino</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                      Cargando…
                    </td>
                  </tr>
                ) : withdrawals.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                      Sin retiros registrados.
                    </td>
                  </tr>
                ) : (
                  withdrawals.map((w) => (
                    <tr key={w.id}>
                      <td className="px-4 py-2 text-neutral-500">
                        {new Date(w.withdrawn_at).toLocaleString("es-AR")}
                      </td>
                      <td className="px-4 py-2 text-neutral-800">{itemName_(w.item_id)}</td>
                      <td className="px-4 py-2 text-neutral-600">
                        {w.quantity} {itemUnit_(w.item_id)}
                      </td>
                      <td className="px-4 py-2 text-neutral-600">{w.withdrawn_by ?? "—"}</td>
                      <td className="px-4 py-2 text-neutral-600">{w.destination ?? "—"}</td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => handleDeleteWithdrawal(w)}
                          className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editingItem && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setEditingItem(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-lg font-semibold text-neutral-900">{editingItem.name}</h2>
            <p className="mb-4 text-sm text-neutral-500">
              Usá esto para recargar stock (subir el "inicial/cargado") o ajustar el mínimo.
            </p>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-neutral-700">
                  Stock inicial/cargado
                </span>
                <input
                  type="number"
                  value={editInitialStock}
                  onChange={(e) => setEditInitialStock(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-neutral-700">
                  Stock mínimo (alerta)
                </span>
                <input
                  type="number"
                  value={editMinStock}
                  onChange={(e) => setEditMinStock(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setEditingItem(null)}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
              >
                Cancelar
              </button>
              <button
                onClick={confirmEditItem}
                className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StockPage() {
  return (
    <ProtectedRoute section="stock">
      <AppShell>
        <StockContent />
      </AppShell>
    </ProtectedRoute>
  );
}
