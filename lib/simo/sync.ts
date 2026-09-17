import { createAdminClient } from "@/lib/supabase/admin";
import { loginSimo, prepararRelatorioSimo, baixarCsvSimo } from "@/lib/simo/client";
import { csvParaObras } from "@/lib/simo/parseCsv";

const TAMANHO_LOTE = 1000;

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

    // Um único carimbo de tempo pra toda a execução: cada linha gravada
    // agora leva esse valor, então dá pra achar as que "sumiram" do
    // relatório do SIMO comparando o carimbo, em vez de montar uma
    // lista gigante de IDs numa cláusula NOT IN (o que quebra/estoura
    // com milhares de linhas).
    const syncIniciadoEm = new Date().toISOString();

    const lotes: (typeof obras)[] = [];
    for (let i = 0; i < obras.length; i += TAMANHO_LOTE) {
      lotes.push(obras.slice(i, i + TAMANHO_LOTE));
    }

    const resultados = await Promise.all(
      lotes.map((lote) =>
        admin.from("obras").upsert(
          lote.map((o) => ({ ...o, atualizado_em: syncIniciadoEm })),
          { onConflict: "id_acao" }
        )
      )
    );
    const erroLote = resultados.find((r) => r.error);
    if (erroLote?.error) throw new Error(`Falha ao gravar lote no Supabase: ${erroLote.error.message}`);

    // Ações que existiam antes desse carimbo e não foram tocadas nesta
    // execução saíram do relatório do SIMO (encerradas/excluídas lá).
    const { error: erroDelete } = await admin.from("obras").delete().lt("atualizado_em", syncIniciadoEm);
    if (erroDelete) throw new Error(`Falha ao remover ações obsoletas: ${erroDelete.message}`);

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
