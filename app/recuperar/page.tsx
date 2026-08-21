"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function RecuperarPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/restablecer`
        : undefined;

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo }
    );

    setSubmitting(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-6 text-center">
          <p className="text-3xl">🚒</p>
          <h1 className="mt-1 text-xl font-bold text-neutral-900">
            Recuperar contraseña
          </h1>
          <p className="text-sm text-neutral-500">
            Te enviamos un link para elegir una nueva
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {sent ? (
          <div className="rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
            Si el email existe en el sistema, te llegó un correo con un link
            para restablecer tu contraseña. Revisá también spam.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-neutral-700">
                Email
              </span>
              <input
                type="email"
                required
                value={email}
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-brand py-2 font-medium text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {submitting ? "Enviando…" : "Enviar link"}
            </button>
          </form>
        )}

        <div className="mt-4 text-center text-sm">
          <Link href="/" className="text-brand hover:underline">
            Volver al login
          </Link>
        </div>
      </div>
    </div>
  );
}
