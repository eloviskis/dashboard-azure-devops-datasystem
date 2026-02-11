-- Migração: Adicionar novos campos de Root Cause Analysis
-- Executar no PostgreSQL do VPS

ALTER TABLE work_items ADD COLUMN IF NOT EXISTS root_cause_task TEXT;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS root_cause_team TEXT;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS root_cause_version TEXT;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS dev TEXT;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS platform TEXT;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS application TEXT;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS branch_base TEXT;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS delivered_version TEXT;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS base_version TEXT;

-- Verificar colunas adicionadas
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'work_items' 
ORDER BY ordinal_position;
