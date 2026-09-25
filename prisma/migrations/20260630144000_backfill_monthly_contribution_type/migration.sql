UPDATE "MonthlyFee"
SET "tipoContribuicao" = 'MENSALIDADE_CORRENTE'
WHERE "tipoContribuicao" IS NULL;
