-- Adicionar campos de Identificação e Falha do Processo
-- Identificação: Custom.7ac99842-e0ec-4f18-b91b-53bfe3e3b3f5
-- Falha do processo: Custom.Falhadoprocesso

ALTER TABLE work_items ADD COLUMN IF NOT EXISTS identificacao TEXT;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS falha_do_processo TEXT;

-- Comentários sobre os campos
COMMENT ON COLUMN work_items.identificacao IS 'Quem identificou o problema (Cliente, Interno, Monitoramento, Parceiro, Testes automatizados)';
COMMENT ON COLUMN work_items.falha_do_processo IS 'Por que o problema ocorreu (Cenários de teste não levantados, Falha de detecção em code review, etc.)';
