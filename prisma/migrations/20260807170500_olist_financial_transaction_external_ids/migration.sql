ALTER TABLE "public"."FinancialTransaction"
ADD COLUMN "externalSource" TEXT,
ADD COLUMN "externalId" TEXT;

CREATE INDEX "FinancialTransaction_externalSource_idx"
ON "public"."FinancialTransaction"("externalSource");

CREATE UNIQUE INDEX "FinancialTransaction_templeId_externalSource_externalId_key"
ON "public"."FinancialTransaction"("templeId", "externalSource", "externalId");
