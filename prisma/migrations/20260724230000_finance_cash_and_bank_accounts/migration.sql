CREATE TYPE "public"."BankAccountType" AS ENUM ('CORRENTE', 'POUPANCA', 'PAGAMENTO', 'INVESTIMENTO');

CREATE TABLE "public"."FinancialBankAccount" (
  "id" TEXT NOT NULL,
  "templeId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "banco" TEXT NOT NULL,
  "agencia" TEXT,
  "conta" TEXT,
  "titular" TEXT,
  "documento" TEXT,
  "tipo" "public"."BankAccountType" NOT NULL DEFAULT 'CORRENTE',
  "observacoes" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "FinancialBankAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."CashRegister" (
  "id" TEXT NOT NULL,
  "templeId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "descricao" TEXT,
  "observacoes" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."CashSession" (
  "id" TEXT NOT NULL,
  "templeId" TEXT NOT NULL,
  "cashRegisterId" TEXT NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL,
  "openingBalance" DECIMAL(12,2) NOT NULL,
  "openingNotes" TEXT,
  "closedAt" TIMESTAMP(3),
  "closingBalance" DECIMAL(12,2),
  "closingNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancialBankAccount_templeId_nome_key" ON "public"."FinancialBankAccount"("templeId", "nome");
CREATE INDEX "FinancialBankAccount_templeId_idx" ON "public"."FinancialBankAccount"("templeId");

CREATE UNIQUE INDEX "CashRegister_templeId_nome_key" ON "public"."CashRegister"("templeId", "nome");
CREATE INDEX "CashRegister_templeId_idx" ON "public"."CashRegister"("templeId");

CREATE INDEX "CashSession_templeId_idx" ON "public"."CashSession"("templeId");
CREATE INDEX "CashSession_cashRegisterId_idx" ON "public"."CashSession"("cashRegisterId");
CREATE INDEX "CashSession_openedAt_idx" ON "public"."CashSession"("openedAt");
CREATE INDEX "CashSession_closedAt_idx" ON "public"."CashSession"("closedAt");

ALTER TABLE "public"."FinancialBankAccount"
ADD CONSTRAINT "FinancialBankAccount_templeId_fkey"
FOREIGN KEY ("templeId") REFERENCES "public"."Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."CashRegister"
ADD CONSTRAINT "CashRegister_templeId_fkey"
FOREIGN KEY ("templeId") REFERENCES "public"."Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."CashSession"
ADD CONSTRAINT "CashSession_templeId_fkey"
FOREIGN KEY ("templeId") REFERENCES "public"."Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."CashSession"
ADD CONSTRAINT "CashSession_cashRegisterId_fkey"
FOREIGN KEY ("cashRegisterId") REFERENCES "public"."CashRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE;
