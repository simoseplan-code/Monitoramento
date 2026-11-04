-- Nova função DIGEPI: acesso só ao "Mapa de Recursos Hídricos" (e só às tipologias de recursos hídricos).
--
-- Como a pessoa DIGEPI é guardada: papel = 'digepi' E status = 'digepi'. O status é de propósito diferente de
-- 'aprovado': todas as regras de segurança do banco e da API que exigem status 'aprovado' continuam barrando
-- a pessoa por padrão (ela não lê ações, perfis, sobreposições etc. nem pela API do Supabase). O Mapa de Recursos
-- Hídricos é o único lugar que aceita 'digepi', e lê os dados pelo servidor, já filtrados pelas tipologias.
-- Só o administrador cria ou muda uma pessoa DIGEPI (a regra de proteção de função/status da 0060 continua valendo).

-- Troca as regras de valores permitidos em papel e status (acha pelo conteúdo, para não depender do nome).
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and (pg_get_constraintdef(oid) ilike '%papel%' or pg_get_constraintdef(oid) ilike '%status%')
  loop
    execute format('alter table public.profiles drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_status_check check (status in ('pendente', 'aprovado', 'rejeitado', 'digepi'));

alter table public.profiles
  add constraint profiles_papel_check check (papel in ('admin', 'chefe', 'equipe', 'digepi'));
