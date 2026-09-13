import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Le avisa a Telegram a qué dirección mandar los clics de los botones
// (ACUDO / NO ACUDO) del bot del cuartel. Antes había que armar esa URL a
// mano y pegarla en el navegador cada vez que cambiaba la dirección del
// sitio (por ejemplo, al mudarse a un dominio propio). Ahora lo hace este
// botón solo, usando la dirección con la que se está accediendo al sitio
// en ese momento — así nunca hay que escribir ni guardar esa URL a mano.
//
// Solo el admin puede usar esto (se valida el token de sesión de Supabase
// y el rol del perfil), para que no cualquiera pueda desviar las alertas
// del cuartel a otro lado.

async function getCallerRole(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) return null;

  // OJO: hay que pasar el token también como header Authorization al crear
  // el cliente. Sin esto, la consulta de abajo a "profiles" viaja como
  // anónima (RLS no reconoce quién sos) y siempre devuelve vacío, aunque
  // seas admin — por eso antes esto tiraba "No autorizado" para cualquiera.
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  return profile?.role ?? null;
}

function currentSiteUrl(request: NextRequest) {
  // request.nextUrl.origin refleja la dirección real con la que se accedió
  // al sitio (la que ve el navegador), tanto en producción como en preview.
  return request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const role = await getCallerRole(request);
  if (role !== "admin") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const token = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "El bot de Telegram todavía no está configurado en el sistema." },
      { status: 400 }
    );
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const data = await res.json();

  return NextResponse.json({
    expectedUrl: `${currentSiteUrl(request)}/api/telegram-webhook`,
    telegram: data.result,
  });
}

export async function POST(request: NextRequest) {
  const role = await getCallerRole(request);
  if (role !== "admin") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const token = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "El bot de Telegram todavía no está configurado en el sistema." },
      { status: 400 }
    );
  }

  const webhookUrl = `${currentSiteUrl(request)}/api/telegram-webhook`;

  const res = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`
  );
  const data = await res.json();

  if (!data.ok) {
    return NextResponse.json(
      { error: data.description ?? "Telegram rechazó la solicitud." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, url: webhookUrl });
}
