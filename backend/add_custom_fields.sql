-- Script para adicionar campos customizados na tabela work_items
ALTER TABLE work_items ADD COLUMN causaRaizTask TEXT;
ALTER TABLE work_items ADD COLUMN causaRaizTeam TEXT;
ALTER TABLE work_items ADD COLUMN causaRaizVersion TEXT;
ALTER TABLE work_items ADD COLUMN reincidencia TEXT;
ALTER TABLE work_items ADD COLUMN performanceDays TEXT;
ALTER TABLE work_items ADD COLUMN qa TEXT;
ALTER TABLE work_items ADD COLUMN dev TEXT;
-- Campo priority já existe, mas pode ser garantido
ALTER TABLE work_items ADD COLUMN priority INTEGER;
