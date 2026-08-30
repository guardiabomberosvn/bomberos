import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { uploadToDrive } from "@/lib/googleDrive";

// Necesita el runtime de Node (no el "edge") porque la librería de Google
// usa APIs que el edge no soporta.
export const runtime = "nodejs";

// ARREGLO DE SEGURIDAD: esta ruta subía cualquier archivo a la carpeta de
// Google Drive REAL del cuartel sin pedir ningún tipo de sesión — cualquiera
// que conociera la URL podía llenar el Drive de basura. Ahora exige el
// token de sesión de Supabase (el navegador ya lo tiene guardado) y valida
// tipo/tamaño del archivo antes de subir nada.
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

async function getAuthenticatedUserId(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) return null;

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Necesitás iniciar sesión para subir una foto." },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "La foto pesa demasiado (máximo 15 MB)." },
        { status: 400 }
      );
    }

    if (file.type && !ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Solo se permiten fotos (JPG, PNG, WEBP o HEIC)." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = `${Date.now()}-${file.name}`;

    const url = await uploadToDrive(buffer, fileName, file.type || "application/octet-stream");

    return NextResponse.json({ url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido al subir la foto.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
