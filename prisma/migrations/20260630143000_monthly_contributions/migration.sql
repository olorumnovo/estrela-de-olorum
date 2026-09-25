ALTER TABLE "MonthlyFee"
  ADD COLUMN "tipoContribuicao" TEXT;

DROP INDEX IF EXISTS "MonthlyFee_memberId_competencia_key";

CREATE UNIQUE INDEX IF NOT EXISTS "MonthlyFee_memberId_competencia_tipoContribuicao_key"
  ON "MonthlyFee" ("memberId", "competencia", "tipoContribuicao");

CREATE INDEX IF NOT EXISTS "MonthlyFee_temple_tipo_contribuicao_idx"
  ON "MonthlyFee" ("templeId", "tipoContribuicao");
