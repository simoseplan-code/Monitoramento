-- Bug: quando uma ação some do relatório do SIMO por uma rodada de sync
-- (mesmo que temporariamente — ex.: relatório incompleto naquele dia) ela
-- é apagada de "obras" por ser considerada obsoleta (lib/simo/sync.ts).
-- Só que obras_revisao / obras_unidade_sugestao / obras_termos_revisao
-- tinham "references obras(id_acao) on delete cascade" — a análise já
-- feita ia junto. Quando a ação reaparecia num sync seguinte (linha nova,
-- mesmo id_acao), a revisão já tinha sido perdida pra sempre.
--
-- Isso contraria a regra de que "análise já feita fica fixa no ID" em
-- todas as telas. A partir daqui essas tabelas continuam usando id_acao
-- como chave (pra reconectar automaticamente quando a ação reaparecer),
-- só sem a cascata de exclusão — mesmo padrão já usado em sobreposicoes
-- (chave_obras), que nunca dependeu de FK pra obras.

do $$
declare
  r record;
begin
  for r in
    select con.conname, con.conrelid::regclass as tabela
    from pg_constraint con
    where con.contype = 'f'
      and con.confrelid = 'public.obras'::regclass
      and con.conrelid in (
        'public.obras_revisao'::regclass,
        'public.obras_unidade_sugestao'::regclass,
        'public.obras_termos_revisao'::regclass
      )
  loop
    execute format('alter table %s drop constraint %I', r.tabela, r.conname);
  end loop;
end $$;
