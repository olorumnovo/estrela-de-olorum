CREATE TABLE "public"."FinancialSupplier" (
    "id" TEXT NOT NULL,
    "templeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "documento" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FinancialSupplier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancialSupplier_templeId_nome_key" ON "public"."FinancialSupplier"("templeId", "nome");
CREATE INDEX "FinancialSupplier_templeId_idx" ON "public"."FinancialSupplier"("templeId");

ALTER TABLE "public"."FinancialSupplier"
ADD CONSTRAINT "FinancialSupplier_templeId_fkey"
FOREIGN KEY ("templeId") REFERENCES "public"."Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;
