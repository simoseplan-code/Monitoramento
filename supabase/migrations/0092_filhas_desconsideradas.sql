-- Ações filhas (Configuração de TD) entram sozinhas em "Todas as análises" (menu Ações desconsideradas).
--
-- Quem está em "Todas" sai de tudo: Vinculação SIAFE (lista, contador e o botão Vincular no SIMO), Análise de obras
-- concluídas, Verificação de bairros, Sobreposições, mapas e demais análises. A Configuração de TD continua vendo a
-- ação (ela lê a base completa), então a filha segue aparecendo lá, dentro da mãe.
--
--  - Ao cadastrar uma filha na Configuração de TD: entra em "Todas" na hora (por "Ação filha (Configuração de TD)").
--  - Ao remover a filha (ou a mãe, que leva as filhas junto): sai de "Todas", MAS só se foi o sistema que a colocou.
--    Se alguém já tinha posto o mesmo ID em "Todas" à mão, ele continua lá.
--  - As filhas que já existem hoje entram agora (abaixo).
--  - Enquanto for filha, ninguém tira a ação de "Todas" pela tela Ações desconsideradas: o banco não deixa.

alter table public.acoes_desconsideradas
  add column if not exists origem text not null default 'manual';

-- Só o sistema devolve uma ação filha de "Todas" (a regra de apagar deixa de valer para origem 'filha').
drop policy if exists "equipe aprovada devolve acoes_desconsideradas" on public.acoes_desconsideradas;
create policy "equipe aprovada devolve acoes_desconsideradas"
  on public.acoes_desconsideradas for delete
  using (
    origem <> 'filha'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'aprovado')
  );

create or replace function public.filha_vai_para_desconsideradas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.acoes_desconsideradas (tela, id_acao, desconsiderada_em, desconsiderada_por, por_nome, origem)
    values ('todas', new.id_acao, now(), new.criado_por, 'Ação filha (Configuração de TD)', 'filha')
    on conflict (tela, id_acao) do nothing;
    return new;
  end if;
  -- Filha removida (ou mãe removida, que leva as filhas): sai de "Todas" só o que o sistema pôs.
  delete from public.acoes_desconsideradas where tela = 'todas' and id_acao = old.id_acao and origem = 'filha';
  return old;
end;
$$;

drop trigger if exists td_filha_desconsiderada on public.td_acoes_filha;
create trigger td_filha_desconsiderada
  after insert or delete on public.td_acoes_filha
  for each row execute function public.filha_vai_para_desconsideradas();

-- As filhas que já estão cadastradas entram agora.
insert into public.acoes_desconsideradas (tela, id_acao, desconsiderada_em, desconsiderada_por, por_nome, origem)
select 'todas', f.id_acao, now(), null, 'Ação filha (Configuração de TD)', 'filha'
from public.td_acoes_filha f
on conflict (tela, id_acao) do nothing;
