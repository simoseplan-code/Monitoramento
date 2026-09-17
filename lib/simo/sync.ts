import { createAdminClient } from "@/lib/supabase/admin";
import { loginSimo, prepararRelatorioSimo, baixarCsvSimo } from "@/lib/simo/client";
import { csvParaObras } from "@/lib/simo/parseCsv";

export async function executarSyncSimo(): Promise<{ linhas: number }> {
  const admin = createAdminClient();

  try {
    const cookie = await loginSimo();
    await prepararRelatorioSimo(cookie);
    const csvText = await baixarCsvSimo(cookie);
    const obras = csvParaObras(csvText);

    if (obras.length === 0) {
      throw new Error("O SIMO retornou 0 linhas — provavelmente algo mudou no relatório. Sync abortado sem apagar dados.");
    }

    const TAMANHO_LOTE = 500;
    for (let i = 0; i < obras.length; i += TAMANHO_LOTE) {
      const lote = obras.slice(i, i + TAMANHO_LOTE).map((o) => ({ ...o, atualizado_em: new Date().toISOString() }));
      const { error } = await admin.from("obras").upsert(lote, { onConflict: "id_acao" });
      if (error) throw new Error(`Falha ao gravar lote no Supabase: ${error.message}`);
    }

    const idsAtuais = obras.map((o) => o.id_acao);
    await admin.from("obras").delete().not("id_acao", "in", `(${idsAtuais.map((id) => `"${id}"`).join(",")})`);

    const vinculadas = obras.filter((o) => !!o.numero_automatico).length;
    const pendentes = obras.filter((o) => !o.numero_automatico && !!o.numero_siafe).length;
    const dadoIncorreto = obras.filter((o) => o.numero_siafe && !/^\d{8}$/.test(o.numero_siafe)).length;

    await admin.from("obras_historico").insert({
      total: obras.length,
      vinculadas,
      pendentes,
      dado_incorreto: dadoIncorreto,
    });

    await admin.from("sync_log").insert({
      sucesso: true,
      linhas_processadas: obras.length,
      mensagem: `OK: ${obras.length} ações sincronizadas.`,
    });

    return { linhas: obras.length };
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Erro desconhecido.";
    await admin.from("sync_log").insert({ sucesso: false, mensagem });
    throw new Error(mensagem);
  }
}
