"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { sendTelegramMessage } from "@/lib/telegram";
import type { DispatchGroup, EmergencyTarget, EmergencyType, Profile } from "@/lib/types";

export function DispatchModal({
  type,
  organizationId,
  createdBy,
  groups,
  personal,
  onClose,
  onDispatched,
}: {
  type: EmergencyType;
  organizationId: string;
  createdBy: string;
  groups: DispatchGroup[];
  personal: Profile[];
  onClose: () => void;
  onDispatched: () => void;
}) {
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [target, setTarget] = useState<EmergencyTarget>("todos");
  const [needsResponse, setNeedsResponse] = useState(true);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDispatch = async () => {
    setError(null);

    if (target === "grupos" && selectedGroupIds.size === 0) {
      setError("Elegí al menos un grupo.");
      return;
    }
    if (target === "individual" && selectedPersonIds.size === 0) {
      setError("Elegí al menos una persona.");
      return;
    }

    setSubmitting(true);

    const { data: created, error: insertError } = await supabase
      .from("emergencies")
      .insert({
        organization_id: organizationId,
        title: type.code ? `${type.name} · ${type.code}` : type.name,
        address: address.trim() || null,
        notes: notes.trim() || null,
        target,
        needs_response: needsResponse,
        emergency_type_id: type.id,
        created_by: createdBy,
      })
      .select()
      .single();

    if (insertError || !created) {
      setError(insertError?.message ?? "No se pudo accionar la alarma.");
      setSubmitting(false);
      return;
    }

    if (target === "grupos") {
      const rows = Array.from(selectedGroupIds).map((group_id) => ({
        emergency_id: created.id,
        group_id,
      }));
      const { error: gError } = await supabase
        .from("emergency_target_groups")
        .insert(rows);
      if (gError) setError(gError.message);
    }

    if (target === "individual") {
      const rows = Array.from(selectedPersonIds).map((profile_id) => ({
        emergency_id: created.id,
        profile_id,
      }));
      const { error: rError } = await supabase
        .from("emergency_recipients")
        .insert(rows);
      if (rError) setError(rError.message);
    }

    // Notificar por Telegram a los destinatarios que ya vincularon su cuenta.
    // No bloquea el flujo si falla: la alarma ya quedó activa en el sistema.
    try {
      let recipientIds: string[] = [];
      if (target === "todos") {
        recipientIds = personal.map((p) => p.id);
      } else if (target === "individual") {
        recipientIds = Array.from(selectedPersonIds);
      } else if (target === "grupos") {
        const { data: members } = await supabase
          .from("dispatch_group_members")
          .select("profile_id")
          .in("group_id", Array.from(selectedGroupIds));
        recipientIds = Array.from(
          new Set((members ?? []).map((m) => m.profile_id as string))
        );
      }

      const recipients = personal.filter(
        (p) => recipientIds.includes(p.id) && p.telegram_chat_id
      );

      const message =
        `🚨 <b>${type.name}${type.code ? " · " + type.code : ""}</b>\n` +
        (address.trim() ? `📍 ${address.trim()}\n` : "") +
        (notes.trim() ? `${notes.trim()}\n` : "") +
        (needsResponse
          ? `\nRespondé desde estos botones o abrí la app.`
          : `\nAviso informativo — no requiere convocatoria.`);

      const replyMarkup = needsResponse
        ? {
            inline_keyboard: [
              [
                { text: "✅ ACUDO", callback_data: `acudo:${created.id}` },
                { text: "❌ NO ACUDO", callback_data: `no_acudo:${created.id}` },
              ],
            ],
          }
        : undefined;

      await Promise.all(
        recipients.map((p) =>
          sendTelegramMessage(p.telegram_chat_id as string, message, replyMarkup)
        )
      );
    } catch {
      // Silencioso: la emergencia ya se creó igual, esto es solo el aviso extra.
    }

    setSubmitting(false);
    onDispatched();
  };

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <span
            className="flex h-12 w-12 items-center justify-center rounded-full text-2xl text-white"
            style={{ backgroundColor: type.color }}
          >
            {type.icon}
          </span>
          <div>
            <h2 className="text-lg font-bold text-neutral-900">{type.name}</h2>
            {type.code && (
              <p className="text-sm text-neutral-500">{type.code}</p>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-neutral-700">
              Ubicación (opcional)
            </span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Dirección o referencia"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-neutral-700">
              Mensaje para el personal (opcional)
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </label>

          <label className="flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={needsResponse}
              onChange={(e) => setNeedsResponse(e.target.checked)}
            />
            <span>
              <span className="font-medium text-neutral-700">
                Con convocatoria
              </span>
              <span className="ml-1 text-neutral-500">
                (pide ACUDO / NO ACUDO — desmarcá si es solo un aviso informativo)
              </span>
            </span>
          </label>

          <div className="text-sm">
            <span className="mb-1 block font-medium text-neutral-700">
              Convocar a
            </span>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["todos", "Todo el cuerpo"],
                  ["grupos", "Por grupo"],
                  ["individual", "Personas puntuales"],
                ] as [EmergencyTarget, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTarget(value)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    target === value
                      ? "bg-brand text-white"
                      : "border border-neutral-300 text-neutral-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {target === "grupos" && (
            <div className="max-h-40 overflow-y-auto rounded-md border border-neutral-200 p-2">
              {groups.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  No hay grupos creados todavía. Andá a "Grupos" para crear
                  alguno.
                </p>
              ) : (
                groups.map((g) => (
                  <label
                    key={g.id}
                    className="flex items-center gap-2 py-1 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedGroupIds.has(g.id)}
                      onChange={(e) => {
                        const next = new Set(selectedGroupIds);
                        if (e.target.checked) next.add(g.id);
                        else next.delete(g.id);
                        setSelectedGroupIds(next);
                      }}
                    />
                    {g.name}
                  </label>
                ))
              )}
            </div>
          )}

          {target === "individual" && (
            <div className="max-h-40 overflow-y-auto rounded-md border border-neutral-200 p-2">
              {personal.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 py-1 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedPersonIds.has(p.id)}
                    onChange={(e) => {
                      const next = new Set(selectedPersonIds);
                      if (e.target.checked) next.add(p.id);
                      else next.delete(p.id);
                      setSelectedPersonIds(next);
                    }}
                  />
                  {p.full_name}
                </label>
              ))}
            </div>
          )}

          <button
            onClick={handleDispatch}
            disabled={submitting}
            className="w-full rounded-md bg-brand py-3 text-base font-bold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {submitting ? "Accionando…" : "🚨 ACCIONAR ALARMA"}
          </button>
        </div>
      </div>
    </div>
  );
}
