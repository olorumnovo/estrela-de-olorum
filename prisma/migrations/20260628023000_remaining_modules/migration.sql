-- CreateEnum
CREATE TYPE "SpiritualCareStatus" AS ENUM ('AGENDADO', 'EM_ATENDIMENTO', 'FINALIZADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('OPEN', 'PAID', 'CANCELED');

-- AlterEnum
ALTER TYPE "ScheduleType" ADD VALUE IF NOT EXISTS 'CULTO';
ALTER TYPE "ScheduleType" ADD VALUE IF NOT EXISTS 'SESSAO';
ALTER TYPE "ScheduleType" ADD VALUE IF NOT EXISTS 'OBRIGACAO';
ALTER TYPE "ScheduleType" ADD VALUE IF NOT EXISTS 'TRABALHO';

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'TRANSFER';
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'INVENTORY';

-- AlterTable
ALTER TABLE "Schedule" ADD COLUMN "responsavel" TEXT;

-- AlterTable
ALTER TABLE "FinancialTransaction" ADD COLUMN "centroCusto" TEXT;

-- AlterTable
ALTER TABLE "Product"
ADD COLUMN "fornecedor" TEXT,
ADD COLUMN "localizacao" TEXT,
ADD COLUMN "lote" TEXT,
ADD COLUMN "validade" TIMESTAMP(3),
ADD COLUMN "status" TEXT;

-- AlterTable
ALTER TABLE "StockMovement"
ADD COLUMN "origem" TEXT,
ADD COLUMN "destino" TEXT;

-- AlterTable
ALTER TABLE "Sale"
ADD COLUMN "memberId" TEXT,
ADD COLUMN "acrescimo" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "status" "SaleStatus" NOT NULL DEFAULT 'PAID';

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "SpiritualCare" (
  "id" TEXT NOT NULL,
  "templeId" TEXT NOT NULL,
  "memberId" TEXT,
  "consulente" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "responsavel" TEXT,
  "data" TIMESTAMP(3) NOT NULL,
  "descricao" TEXT,
  "observacoes" TEXT,
  "resultado" TEXT,
  "status" "SpiritualCareStatus" NOT NULL DEFAULT 'AGENDADO',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "SpiritualCare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpiritualCareAttachment" (
  "id" TEXT NOT NULL,
  "templeId" TEXT NOT NULL,
  "spiritualCareId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "arquivo" TEXT NOT NULL,
  "tipo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SpiritualCareAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalePayment" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "metodo" "PaymentMethod" NOT NULL,
  "valor" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SalePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpiritualCare_templeId_idx" ON "SpiritualCare"("templeId");

-- CreateIndex
CREATE INDEX "SpiritualCare_memberId_idx" ON "SpiritualCare"("memberId");

-- CreateIndex
CREATE INDEX "SpiritualCareAttachment_templeId_idx" ON "SpiritualCareAttachment"("templeId");

-- CreateIndex
CREATE INDEX "SpiritualCareAttachment_spiritualCareId_idx" ON "SpiritualCareAttachment"("spiritualCareId");

-- CreateIndex
CREATE INDEX "Sale_memberId_idx" ON "Sale"("memberId");

-- CreateIndex
CREATE INDEX "SalePayment_saleId_idx" ON "SalePayment"("saleId");

-- AddForeignKey
ALTER TABLE "SpiritualCare" ADD CONSTRAINT "SpiritualCare_templeId_fkey" FOREIGN KEY ("templeId") REFERENCES "Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpiritualCare" ADD CONSTRAINT "SpiritualCare_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpiritualCareAttachment" ADD CONSTRAINT "SpiritualCareAttachment_templeId_fkey" FOREIGN KEY ("templeId") REFERENCES "Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpiritualCareAttachment" ADD CONSTRAINT "SpiritualCareAttachment_spiritualCareId_fkey" FOREIGN KEY ("spiritualCareId") REFERENCES "SpiritualCare"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalePayment" ADD CONSTRAINT "SalePayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
