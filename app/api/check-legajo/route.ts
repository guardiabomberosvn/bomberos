import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Chequea si un legajo ya está en uso, ANTES de intentar crear la cuenta.
// Se llama desde la pantalla de "Primera instalación / Crear usuario",
// donde todavía no hay sesión iniciada — por eso no se puede consultar
// "profiles" directo desde el navegador (las reglas de la base de datos
// no dejan leerla sin estar logueado) y se usa esta rutita con la clave de
// servicio en vez de eso. Así se puede avisar en el momento con un mensaje
// claro, en vez de que la creación de cuenta falle más abajo con un error
// genérico de la base de datos que nadie entiende.

const DEMO_ORG_ID = "11111111-1111-1111-1111-111111111111";

export async function POST(request: NextRequest) {
  const { legajo } = (await request.json().catch(() => ({}))) as { legajo?: string };
  const trimmed = legajo?.trim();
  if (!trimmed) {
    return NextResponse.json({ exists: false });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    // Si falta la configuración del servidor, dejamos pasar: el intento de
    // creación de cuenta igual va a fallar más abajo si el legajo está
    // repetido, y ahí se muestra el mensaje genérico de reserva.
    return NextResponse.json({ exists: false });
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("organization_id", DEMO_ORG_ID)
    .eq("legajo", trimmed)
    .maybeSingle();

  return NextResponse.json({ exists: !!data });
}
