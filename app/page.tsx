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

    // Chequeo previo del legajo: si ya está en uso, avisamos en el acto con
    // un mensaje claro en vez de intentar crear la cuenta y que falle más
    // abajo con un error genérico de la base de datos que no dice nada.
    if (legajo.trim()) {
      try {
        const checkRes = await fetch("/api/check-legajo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ legajo: legajo.trim() }),
        });
        const checkData = await checkRes.json();
        if (checkData.exists) {
          setSubmitting(false);
          setError(
            `Ya existe una persona con el legajo "${legajo.trim()}". Elegí otro número.`
          );
          return;
        }
      } catch {
        // Si el chequeo falla (sin conexión, etc.), seguimos igual — el
        // alta puede fallar más abajo y ahí se muestra el mensaje de reserva.
      }
    }

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
  // Para el campo de contraseña agregamos un botoncito de "ojito" para
  // mostrar/ocultar lo que se escribió, tanto al ingresar como al crear
  // la cuenta — así uno puede verificar que la puso bien antes de mandar
  // el formulario.
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && showPassword ? "text" : type;

  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-neutral-700">{label}</span>
      <div className="relative">
        <input
          type={inputType}
          value={value}
          required={required}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded-md border border-neutral-300 px-3 py-2 outline-none focus:border-brand focus:ring-1 focus:ring-brand ${
            isPassword ? "pr-10" : ""
          }`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            tabIndex={-1}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-neutral-400 hover:text-neutral-600"
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {showPassword ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z" clipRule="evenodd" />
                <path d="m10.748 13.93 2.523 2.523a9.987 9.987 0 0 1-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 0 1 0-1.186A10.007 10.007 0 0 1 2.839 6.02L6.07 9.252a4 4 0 0 0 4.678 4.678Z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.147.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        )}
      </div>
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
  if (message.includes("email rate limit exceeded")) {
    return "Se mandaron demasiados correos en poco tiempo. Esperá un rato y probá de nuevo.";
  }
  if (message.includes("Database error saving new user")) {
    // El chequeo previo del legajo (más arriba, en handleRegister) ya
    // debería atajar el caso más común, pero dejamos esto como red de
    // contención por si pasa igual (ej: dos personas cargando el mismo
    // legajo al mismo tiempo).
    return "No se pudo crear la cuenta. Si pusiste un número de legajo, puede que ya esté en uso — probá con otro o dejalo vacío.";
  }
  return message;
}
