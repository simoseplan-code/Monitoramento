import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { guardarKml, registrarFalha } from "@/lib/kml/guardar";
import { registrarAnalise } from "@/lib/analisesLog";
import { abrirSessaoSimo, baixarKmlComSessao, SemKmlError } from "@/lib/simo/kml";

export const runtime = "nodejs";
export const maxDuration = 300;

type Situacao = "baixado" | "ja_tinha" | "sem_kml" | "erro" | "adiado";
const MAX_POR_ENVIO = 10;
const PRAZO_MS = 240_000; // deixa folga antes do limite da função

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Baixa em lote o KML de várias ações do SIMO e guarda. O painel manda poucas ações por vez
// (a tela faz as chamadas em sequência e mostra o andamento). Só administrador/chefe, porque
// cada ação é um acesso ao SIMO com o login do painel.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: perfil } = await supabase.from("profiles").select("is_admin, status").eq("id", user.id).single();
  if (!perfil?.is_admin || perfil.status !== "aprovado") return NextResponse.json({ error: "Só administrador ou chefe baixa KML em lote." }, { status: 403 });

  const corpo = (await request.json().catch(() => null)) as { ids?: unknown; forcar?: unknown } | null;
  const forcar = corpo?.forcar === true;
  const ids = Array.from(new Set((Array.isArray(corpo?.ids) ? corpo!.ids : []).filter((i): i is string => typeof i === "string" && /^\d{1,12}$/.test(i))));
  if (ids.length === 0) return NextResponse.json({ error: "Nenhum ID válido." }, { status: 400 });
  if (ids.length > MAX_POR_ENVIO) return NextResponse.json({ error: `Mande no máximo ${MAX_POR_ENVIO} IDs por vez.` }, { status: 400 });

  const admin = createAdminClient();
  const { data: existentes } = await admin.from("kml_arquivos").select("id_acao").eq("situacao", "baixado").in("id_acao", ids);
  const jaTem = new Set((existentes ?? []).map((r) => r.id_acao as string));

  const resultados: { id: string; situacao: Situacao; mensagem?: string; extensaoKm?: number | null }[] = [];
  const inicio = Date.now();
  let cookie: string | null = null;

  for (const id of ids) {
    if (!forcar && jaTem.has(id)) {
      resultados.push({ id, situacao: "ja_tinha" });
      continue;
    }
    if (Date.now() - inicio > PRAZO_MS) {
      resultados.push({ id, situacao: "adiado" });
      continue;
    }
    try {
      cookie = cookie ?? (await abrirSessaoSimo());
      const { buffer, nome } = await baixarKmlComSessao(cookie, id);
      const guardou = await guardarKml(admin, id, buffer, nome, user.id);
      if (guardou) {
        const { data } = await admin.from("kml_arquivos").select("extensao_km").eq("id_acao", id).maybeSingle();
        resultados.push({ id, situacao: "baixado", extensaoKm: data?.extensao_km ?? null });
        await registrarAnalise(admin, user.id, "kml", id, "baixado_no_simo", "lote");
      } else {
        resultados.push({ id, situacao: "erro", mensagem: "KML grande demais para guardar (limite de 25 MB)." });
      }
    } catch (e) {
      if (e instanceof SemKmlError) {
        await registrarFalha(admin, id, "sem_kml", e.message).catch(() => undefined);
        resultados.push({ id, situacao: "sem_kml" });
      } else {
        const msg = e instanceof Error ? e.message : "Erro desconhecido.";
        await registrarFalha(admin, id, "erro", msg).catch(() => undefined);
        resultados.push({ id, situacao: "erro", mensagem: msg.slice(0, 200) });
      }
    }
    await pausa(300); // não sobrecarrega o SIMO
  }

  return NextResponse.json({ ok: true, resultados });
}
