-- CreateTable
CREATE TABLE "Profession" (
    "id" TEXT NOT NULL,
    "templeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReligiousFunction" (
    "id" TEXT NOT NULL,
    "templeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReligiousFunction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactType" (
    "id" TEXT NOT NULL,
    "templeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpiritualEntity" (
    "id" TEXT NOT NULL,
    "templeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpiritualEntity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Profession_templeId_idx" ON "Profession"("templeId");

-- CreateIndex
CREATE UNIQUE INDEX "Profession_templeId_nome_key" ON "Profession"("templeId", "nome");

-- CreateIndex
CREATE INDEX "ReligiousFunction_templeId_idx" ON "ReligiousFunction"("templeId");

-- CreateIndex
CREATE UNIQUE INDEX "ReligiousFunction_templeId_nome_key" ON "ReligiousFunction"("templeId", "nome");

-- CreateIndex
CREATE INDEX "ContactType_templeId_idx" ON "ContactType"("templeId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactType_templeId_nome_key" ON "ContactType"("templeId", "nome");

-- CreateIndex
CREATE INDEX "SpiritualEntity_templeId_idx" ON "SpiritualEntity"("templeId");

-- CreateIndex
CREATE UNIQUE INDEX "SpiritualEntity_templeId_nome_key" ON "SpiritualEntity"("templeId", "nome");

-- AddForeignKey
ALTER TABLE "Profession" ADD CONSTRAINT "Profession_templeId_fkey" FOREIGN KEY ("templeId") REFERENCES "Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReligiousFunction" ADD CONSTRAINT "ReligiousFunction_templeId_fkey" FOREIGN KEY ("templeId") REFERENCES "Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactType" ADD CONSTRAINT "ContactType_templeId_fkey" FOREIGN KEY ("templeId") REFERENCES "Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpiritualEntity" ADD CONSTRAINT "SpiritualEntity_templeId_fkey" FOREIGN KEY ("templeId") REFERENCES "Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;
