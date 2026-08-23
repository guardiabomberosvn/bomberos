import { google } from "googleapis";
import { Readable } from "stream";

/**
 * Arma el cliente autenticado contra la cuenta de servicio de Google Drive.
 * Las credenciales viven en variables de entorno (nunca en el código):
 *   GOOGLE_DRIVE_CLIENT_EMAIL, GOOGLE_DRIVE_PRIVATE_KEY, GOOGLE_DRIVE_FOLDER_ID
 * Acepta la clave privada tanto si quedó guardada con saltos de línea reales
 * como si quedó con "\n" escritos tal cual se copia de un archivo .json de
 * credenciales — así no importa cómo se haya pegado en Vercel.
 */
function getAuth() {
  const email = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error("Google Drive no está configurado (faltan variables de entorno).");
  }
  const key = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;

  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
}

/**
 * Sube un archivo a la carpeta de Google Drive compartida con la cuenta de
 * servicio (GOOGLE_DRIVE_FOLDER_ID), lo hace visible para cualquiera que
 * tenga el link (sin necesidad de estar invitado a esa foto puntual), y
 * devuelve ese link para guardarlo como photo_url.
 */
export async function uploadToDrive(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<string> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    throw new Error("Google Drive no está configurado (falta GOOGLE_DRIVE_FOLDER_ID).");
  }

  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });

  const uploaded = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: "id, webViewLink",
  });

  const fileId = uploaded.data.id;
  if (!fileId) {
    throw new Error("Google Drive no devolvió el archivo subido.");
  }

  await drive.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
  });

  return uploaded.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`;
}
