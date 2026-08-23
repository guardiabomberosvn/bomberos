import { NextRequest, NextResponse } from "next/server";
import { uploadToDrive } from "@/lib/googleDrive";

// Necesita el runtime de Node (no el "edge") porque la librería de Google
// usa APIs que el edge no soporta.
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 });
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
