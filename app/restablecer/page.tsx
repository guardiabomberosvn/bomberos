"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function RestablecerPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Supabase manda el token en el hash de la URL y crea una sesión temporal
  // de tipo "recovery" automáticamente al cargar la página.
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });

    // Por si el evento ya disparó antes de montar el listener.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });
    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.replace("/dashboard"), 1500);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-6 text-center">
          <p className="text-3xl">🚒</p>
          <h1 className="mt-1 text-xl font-bold text-neutral-900">
            Elegir nueva contraseña
          </h1>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {done ? (
          <div className="rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
            Contraseña actualizada. Redirigiendo…
          </div>
        ) : !ready ? (
          <p className="text-sm text-neutral-500">
            Verificando el link de recuperación…
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-neutral-700">
                Nueva contraseña
              </span>
              <input
                type="password"
                required
                value={password}
                autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-neutral-700">
                Repetir contraseña
              </span>
              <input
                type="password"
                required
                value={confirmPassword}
                autoComplete="new-password"
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-brand py-2 font-medium text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {submitting ? "Guardando…" : "Guardar nueva contraseña"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
