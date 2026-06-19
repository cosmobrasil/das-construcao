-- Migration: Adiciona coluna relatorio_html à tabela assessments
-- Aplicar via: psql $DATABASE_URL -f migrations/2026-06-19-add-relatorio-html.sql
-- Ou executar manualmente no SQL do Railway.

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS relatorio_html TEXT;

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS indice_pcm NUMERIC(6,2);
