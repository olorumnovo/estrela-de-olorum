CREATE TABLE "public"."CashLedgerEntry" (
  "id" TEXT NOT NULL,
  "templeId" TEXT NOT NULL,
  "accountName" TEXT NOT NULL,
  "entryDate" TIMESTAMP(3) NOT NULL,
  "category" TEXT,
  "description" TEXT NOT NULL,
  "movementType" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "externalId" TEXT,
  "contact" TEXT,
  "document" TEXT,
  "tags" TEXT,
  "documentNumber" TEXT,
  "sourceFile" TEXT NOT NULL,
  "transferFrom" TEXT,
  "transferTo" TEXT,
  "isTransfer" BOOLEAN NOT NULL DEFAULT false,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "CashLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CashLedgerEntry_templeId_accountName_externalId_key"
ON "public"."CashLedgerEntry"("templeId", "accountName", "externalId");

CREATE INDEX "CashLedgerEntry_templeId_idx"
ON "public"."CashLedgerEntry"("templeId");

CREATE INDEX "CashLedgerEntry_accountName_idx"
ON "public"."CashLedgerEntry"("accountName");

CREATE INDEX "CashLedgerEntry_entryDate_idx"
ON "public"."CashLedgerEntry"("entryDate");

CREATE INDEX "CashLedgerEntry_sourceFile_idx"
ON "public"."CashLedgerEntry"("sourceFile");

ALTER TABLE "public"."CashLedgerEntry"
ADD CONSTRAINT "CashLedgerEntry_templeId_fkey"
FOREIGN KEY ("templeId") REFERENCES "public"."Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;
