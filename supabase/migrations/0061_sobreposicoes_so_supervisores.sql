-- Sobreposições fora do acesso da equipe (por enquanto): só admin e chefe leem e
-- alteram. Vale também direto no banco, não só na tela: as funções de leitura
-- passam a rodar com as permissões de quem chama (security invoker), então a regra
-- de linha abaixo vale pra elas também.

drop policy if exists "equipe aprovada le sobreposicoes" on public.sobreposicoes;
drop policy if exists "equipe aprovada insere sobreposicoes" on public.sobreposicoes;
drop policy if exists "equipe aprovada atualiza sobreposicoes" on public.sobreposicoes;
drop policy if exists "responsavel ou admin atualiza sobreposicoes" on public.sobreposicoes;

create policy "supervisor le sobreposicoes"
  on public.sobreposicoes for select
  using (public.is_admin_aprovado(auth.uid()));

create policy "supervisor insere sobreposicoes"
  on public.sobreposicoes for insert
  with check (public.is_admin_aprovado(auth.uid()));

create policy "supervisor atualiza sobreposicoes"
  on public.sobreposicoes for update
  using (public.is_admin_aprovado(auth.uid()));

alter function public.sobreposicoes_lista(text, text, int, boolean, int, int, text, text) security invoker;
alter function public.sobreposicoes_contagens(text, int, boolean, text, text) security invoker;
alter function public.sobreposicoes_orgaos() security invoker;
alter function public.sobreposicoes_anos() security invoker;
alter function public.sobreposicoes_tipologias() security invoker;
alter function public.contar_sobreposicoes_pendentes() security invoker;
