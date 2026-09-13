"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";

type Mode = "login" | "register";

export default function HomePage() {
  const { session, profile, loading } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [legajo, setLegajo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && session && profile?.is_active) {
      router.replace("/dashboard");
    }
  }, [loading, session, profile, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setSubmitting(false);
    if (signInError) {
      setError(traducirError(signInError.message));
      return;
    }
    router.replace("/dashboard");
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setSubmitting(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName || undefined,
          legajo: legajo || undefined,
        },
      },
    });
    setSubmitting(false);

    if (signUpError) {
      setError(traducirError(signUpError.message));
      return;
    }

    // Si Supabase exige confirmar email, no habrá sesión todavía.
    if (data.session) {
      router.replace("/dashboard");
    } else {
      setInfo(
        "Cuenta creada. Revisá tu correo para confirmar la dirección antes de ingresar."
      );
      setMode("login");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-black/[0.06] bg-white p-7 shadow-panel">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="relative h-16 w-16 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.06]">
            <Image src="/logo.png" alt="Bomberos" fill className="object-contain p-1" />
          </div>
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-ink-900">
            Sistema Bomberos
          </h1>
          <p className="text-sm text-ink-400">
            {mode === "login" ? "Ingresá a tu cuenta" : "Primera instalación"}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {info && (
          <div className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {info}
          </div>
        )}

        {mode === "login" ? (
          <form onSubmit={handleLogin} className="space-y-3">
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              required
            />
            <Field
              label="Contraseña"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              required
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-brand py-2 font-medium text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {submitting ? "Ingresando…" : "Ingresar"}
            </button>
            <div className="text-center">
              <Link
                href="/recuperar"
                className="text-xs text-neutral-500 hover:text-brand hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-3">
            <Field
              label="Nombre completo"
              value={fullName}
              onChange={setFullName}
              autoComplete="name"
            />
            <Field
              label="Legajo (opcional)"
              value={legajo}
              onChange={setLegajo}
            />
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              required
            />
            <Field
              label="Contraseña"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              required
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-brand py-2 font-medium text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {submitting ? "Creando cuenta…" : "Crear usuario"}
            </button>
          </form>
        )}

        <div className="mt-4 text-center text-sm">
          {mode === "login" ? (
            <button
              className="text-brand hover:underline"
              onClick={() => {
                setError(null);
                setInfo(null);
                setMode("register");
              }}
            >
              ¿Primera instalación? Crear usuario
            </button>
          ) : (
            <button
              className="text-brand hover:underline"
              onClick={() => {
                setError(null);
                setInfo(null);
                setMode("login");
              }}
            >
              Ya tengo cuenta, ingresar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-neutral-700">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
      />
    </label>
  );
}

function traducirError(message: string): string {
  if (message.includes("Invalid login credentials")) {
    return "Email o contraseña incorrectos.";
  }
  if (message.includes("User already registered")) {
    return "Ya existe una cuenta con ese email.";
  }
  if (message.includes("Email not confirmed")) {
    return "Falta confirmar el email. Revisá tu correo.";
  }
  return message;
}
