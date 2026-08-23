import { google } from "googleapis";
import { Readable } from "stream";

/**
 * Arma el cliente autenticado contra Google Drive usando OAuth2, actuando
 * como la cuenta real del cuartel (guardiabomberosvn@gmail.com) en vez de
 * una cuenta de servicio. Esto es necesario porque las cuentas de servicio
 * no tienen cuota de almacenamiento propia en Google Drive.
 *
 * Las credenciales viven en variables de entorno (nunca en el código):
 *   GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET,
 *   GOOGLE_DRIVE_REFRESH_TOKEN, GOOGLE_DRIVE_FOLDER_ID
 *
 * El Refresh Token se generó una única vez de forma manual (con OAuth
 * Playground) autorizando la cuenta guardiabomberosvn@gmail.com, y no vence
 * mientras la app en Google Cloud esté publicada en estado "En producción".
 */
function getAuth() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google Drive no está configurado (faltan variables de entorno).");
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

/**
 * Sube un archivo a la carpeta de Google Drive del cuartel
 * (GOOGLE_DRIVE_FOLDER_ID), lo hace visible para cualquiera que tenga el
 * link, y devuelve ese link para guardarlo como photo_url.
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
