import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Elimina completamente a una persona del sistema: borra su cuenta de
// autenticación (auth.users) y, por la relación "on delete cascade" que ya
// tiene la tabla profiles, se borra sola su fila de perfil junto con ella.
//
// Solo un admin puede usar esto, y solo sobre alguien de su misma
// organización. Además no se puede una/uno mismo (para no quedarse afuera
// sin querer). Es una acción irreversible: si lo que se busca es que
// alguien deje de aparecer como personal activo sin perder su historial
// (asistencias, hallazgos, etc.), conviene usar "Personal activo" en
// Editar en vez de esto.

async function getCaller(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) return null;

  // Igual que en telegram-set-webhook: hay que pasar el token como header
  // Authorization al crear el cliente, si no la consulta de "profiles"
  // viaja como anónima y nunca encuentra al que llama.
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, organization_id")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile) return null;
  return { id: profile.id as string, role: profile.role as string, organizationId: profile.organization_id as string };
}

export async function POST(request: NextRequest) {
  const caller = await getCaller(request);
  if (!caller || caller.role !== "admin") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { userId } = (await request.json().catch(() => ({}))) as { userId?: string };
  if (!userId) {
    return NextResponse.json({ error: "Falta el id del usuario a eliminar." }, { status: 400 });
  }

  if (userId === caller.id) {
    return NextResponse.json(
      { error: "No podés eliminar tu propia cuenta desde acá." },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." },
      { status: 500 }
    );
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Confirmamos que la persona a borrar sea de la misma organización que
  // el admin que pide el borrado (nunca de otro cuartel).
  const { data: target } = await admin
    .from("profiles")
    .select("id, organization_id, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (!target || target.organization_id !== caller.organizationId) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
