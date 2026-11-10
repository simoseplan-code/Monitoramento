-- Valor medido da ação, lido do SIMO junto com os boletins (o "Valor Total | Medido | Pago" que aparece no topo da ação).
-- O relatório diário não traz o valor medido, então a tela de Compatibilização de medições guarda aqui o que o SIMO mostra.
alter table public.medicoes_leitura
  add column if not exists valor_medido numeric(16,2),
  add column if not exists valor_pago numeric(16,2),
  add column if not exists valor_total numeric(16,2);
