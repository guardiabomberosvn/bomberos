"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import type { Supplier, SupplierPurchase } from "@/lib/types";

function SupplierCard({
  supplier,
  purchases,
  onChanged,
  onEdit,
  onDelete,
}: {
  supplier: Supplier;
  purchases: SupplierPurchase[];
  onChanged: () => void;
  onEdit: (s: Supplier) => void;
  onDelete: (s: Supplier) => void;
}) {
  const { profile } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const total = purchases.reduce((sum, p) => sum + (p.amount ?? 0), 0);

  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !profile) return;
    setError(null);
    const amountValue = amount.trim() ? Number(amount) : null;
    if (amount.trim() && Number.isNaN(amountValue)) {
      setError("El monto tiene que ser un número.");
      return;
    }
    setSaving(true);
    const { error: insertError } = await supabase.from("supplier_purchases").insert({
      organization_id: profile.organization_id,
      supplier_id: supplier.id,
      purchase_date: date,
      amount: amountValue,
      description: description.trim(),
      created_by: profile.id,
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setDate(new Date().toISOString().slice(0, 10));
    setAmount("");
    setDescription("");
    setShowPurchaseForm(false);
    setExpanded(true);
    onChanged();
  };

  const handleDeletePurchase = async (p: SupplierPurchase) => {
    if (!window.confirm("¿Eliminar esta compra del historial?")) return;
    const { error: deleteError } = await supabase.from("supplier_purchases").delete().eq("id", p.id);
    if (deleteError) setError(deleteError.message);
    onChanged();
  };

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-neutral-900">{supplier.name}</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {supplier.specialty ? `${supplier.specialty}` : "Sin especialidad cargada"}
          </p>
          <p className="mt-1.5 space-x-3 text-xs text-neutral-600">
            {supplier.contact_name && <span>👤 {supplier.contact_name}</span>}
            {supplier.phone && <span>📞 {supplier.phone}</span>}
            {supplier.email && <span>✉️ {supplier.email}</span>}
          </p>
          {supplier.notes && <p className="mt-1 text-xs text-neutral-400">{supplier.notes}</p>}
        </div>
        <div className="text-right">
          <p className="text-xs text-neutral-500">Total comprado</p>
          <p className="text-lg font-bold text-neutral-900">${total.toLocaleString("es-AR")}</p>
        </div>
      </div>

      {error && (
        <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
        >
          {expanded ? "Ocultar historial" : `📜 Ver historial (${purchases.length})`}
        </button>
        <button
          onClick={() => setShowPurchaseForm((s) => !s)}
          className="rounded-md bg-brand px-2 py-1 text-xs font-medium text-white hover:bg-brand-dark"
        >
          + Registrar compra
        </button>
        <button
          onClick={() => onEdit(supplier)}
          className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
        >
          Editar
        </button>
        <button
          onClick={() => onDelete(supplier)}
          className="ml-auto rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
        >
          Dar de baja
        </button>
      </div>

      {showPurchaseForm && (
        <form
          onSubmit={handleCreatePurchase}
          className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 sm:grid-cols-2"
        >
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Monto (opcional)"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Qué se compró"
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm sm:col-span-2"
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60 sm:col-span-2"
          >
            {saving ? "Guardando…" : "Guardar compra"}
          </button>
        </form>
      )}

      {expanded && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-200">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-3 py-1.5 font-medium">Fecha</th>
                <th className="px-3 py-1.5 font-medium">Qué se compró</th>
                <th className="px-3 py-1.5 font-medium">Monto</th>
                <th className="px-3 py-1.5 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {purchases.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-neutral-500">
                    Sin compras registradas todavía.
                  </td>
                </tr>
              ) : (
                purchases
                  .slice()
                  .sort((a, b) => (a.purchase_date < b.purchase_date ? 1 : -1))
                  .map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-1.5 text-neutral-600">
                        {new Date(p.purchase_date + "T00:00:00").toLocaleDateString("es-AR")}
                      </td>
                      <td className="px-3 py-1.5 text-neutral-800">{p.description}</td>
                      <td className="px-3 py-1.5 text-neutral-600">
                        {p.amount != null ? `$${p.amount.toLocaleString("es-AR")}` : "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        <button
                          onClick={() => handleDeletePurchase(p)}
                          className="rounded-md border border-red-300 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50"
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
      )}
    </div>
  );
}

function ProveedoresContent() {
  const { profile } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<SupplierPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [editName, setEditName] = useState("");
  const [editSpecialty, setEditSpecialty] = useState("");
  const [editContactName, setEditContactName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: s } = await supabase
      .from("suppliers")
      .select("*")
      .eq("is_active", true)
      .order("name");
    const { data: p } = await supabase
      .from("supplier_purchases")
      .select("*")
      .order("purchase_date", { ascending: false });
    setSuppliers((s as Supplier[]) ?? []);
    setPurchases((p as SupplierPurchase[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const suppliersChannel = supabase
      .channel("suppliers-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "suppliers" }, () => load())
      .subscribe();
    const purchasesChannel = supabase
      .channel("supplier-purchases-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "supplier_purchases" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(suppliersChannel);
      supabase.removeChannel(purchasesChannel);
    };
  }, []);

  const purchasesFor = (supplierId: string) => purchases.filter((p) => p.supplier_id === supplierId);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !profile) return;
    setError(null);
    const { error: insertError } = await supabase.from("suppliers").insert({
      organization_id: profile.organization_id,
      name: name.trim(),
      specialty: specialty.trim() || null,
      contact_name: contactName.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      notes: notes.trim() || null,
    });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setName("");
    setSpecialty("");
    setContactName("");
    setPhone("");
    setEmail("");
    setNotes("");
    setShowForm(false);
    load();
  };

  const openEdit = (s: Supplier) => {
    setEditName(s.name);
    setEditSpecialty(s.specialty ?? "");
    setEditContactName(s.contact_name ?? "");
    setEditPhone(s.phone ?? "");
    setEditEmail(s.email ?? "");
    setEditNotes(s.notes ?? "");
    setEditingSupplier(s);
  };

  const confirmEdit = async () => {
    if (!editingSupplier || !editName.trim()) return;
    const { error: updateError } = await supabase
      .from("suppliers")
      .update({
        name: editName.trim(),
        specialty: editSpecialty.trim() || null,
        contact_name: editContactName.trim() || null,
        phone: editPhone.trim() || null,
        email: editEmail.trim() || null,
        notes: editNotes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editingSupplier.id);
    if (updateError) setError(updateError.message);
    setEditingSupplier(null);
    load();
  };

  const handleDelete = async (s: Supplier) => {
    if (
      !window.confirm(
        `¿Dar de baja a "${s.name}"? No se borra el historial de compras, pero deja de aparecer en el listado.`
      )
    ) {
      return;
    }
    const { error: updateError } = await supabase
      .from("suppliers")
      .update({ is_active: false })
      .eq("id", s.id);
    if (updateError) setError(updateError.message);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-neutral-900">Proveedores</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          + Nuevo proveedor
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="grid grid-cols-1 gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del proveedor"
            required
            className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
          />
          <input
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            placeholder="Especialidad (ej: frenos, electricidad, neumáticos)"
            className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
          />
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Persona de contacto (opcional)"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Teléfono"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Correo (opcional)"
            className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
          />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas (opcional)"
            className="rounded-md border border-neutral-300 px-3 py-2 sm:col-span-2"
          />
          <button
            type="submit"
            className="rounded-md bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark sm:col-span-2"
          >
            Guardar proveedor
          </button>
        </form>
      )}

      <div className="space-y-3">
        {loading ? (
          <p className="text-sm text-neutral-500">Cargando…</p>
        ) : suppliers.length === 0 ? (
          <p className="rounded-xl border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500">
            No hay proveedores cargados todavía.
          </p>
        ) : (
          suppliers.map((s) => (
            <SupplierCard
              key={s.id}
              supplier={s}
              purchases={purchasesFor(s.id)}
              onChanged={load}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      {editingSupplier && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setEditingSupplier(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-semibold text-neutral-900">Editar proveedor</h2>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-neutral-700">Nombre</span>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-neutral-700">Especialidad</span>
                <input
                  value={editSpecialty}
                  onChange={(e) => setEditSpecialty(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-neutral-700">
                  Persona de contacto
                </span>
                <input
                  value={editContactName}
                  onChange={(e) => setEditContactName(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-neutral-700">Teléfono</span>
                <input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-neutral-700">Correo</span>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-neutral-700">Notas</span>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setEditingSupplier(null)}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
              >
                Cancelar
              </button>
              <button
                onClick={confirmEdit}
                disabled={!editName.trim()}
                className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
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

export default function ProveedoresPage() {
  return (
    <ProtectedRoute section="proveedores">
      <AppShell>
        <ProveedoresContent />
      </AppShell>
    </ProtectedRoute>
  );
}
