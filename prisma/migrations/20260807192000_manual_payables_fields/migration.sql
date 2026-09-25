ALTER TABLE "public"."FinancialTransaction"
ADD COLUMN "issuedAt" TIMESTAMP(3),
ADD COLUMN "competencia" TIMESTAMP(3),
ADD COLUMN "rawStatus" TEXT,
ADD COLUMN "amountPaid" DECIMAL(12,2),
ADD COLUMN "documentNumber" TEXT,
ADD COLUMN "paymentReference" TEXT,
ADD COLUMN "sourcePages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "sourceFiles" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "FinancialTransaction_issuedAt_idx"
ON "public"."FinancialTransaction"("issuedAt");

CREATE INDEX "FinancialTransaction_rawStatus_idx"
ON "public"."FinancialTransaction"("rawStatus");
