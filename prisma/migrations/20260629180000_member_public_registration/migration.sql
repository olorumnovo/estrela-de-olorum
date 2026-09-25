ALTER TYPE "MemberStatus" ADD VALUE IF NOT EXISTS 'PENDING';

CREATE TABLE "Hierarchy" (
  "id" TEXT NOT NULL,
  "templeId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Hierarchy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberClassification" (
  "id" TEXT NOT NULL,
  "templeId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MemberClassification_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Member"
  ADD COLUMN "estadoCivil" TEXT,
  ADD COLUMN "admissaoCentro" TIMESTAMP(3),
  ADD COLUMN "hierarchyId" TEXT,
  ADD COLUMN "classificationId" TEXT;

CREATE UNIQUE INDEX "Hierarchy_templeId_nome_key" ON "Hierarchy"("templeId", "nome");
CREATE INDEX "Hierarchy_templeId_idx" ON "Hierarchy"("templeId");

CREATE UNIQUE INDEX "MemberClassification_templeId_nome_key" ON "MemberClassification"("templeId", "nome");
CREATE INDEX "MemberClassification_templeId_idx" ON "MemberClassification"("templeId");

CREATE INDEX "Member_hierarchyId_idx" ON "Member"("hierarchyId");
CREATE INDEX "Member_classificationId_idx" ON "Member"("classificationId");

ALTER TABLE "Hierarchy"
  ADD CONSTRAINT "Hierarchy_templeId_fkey"
  FOREIGN KEY ("templeId") REFERENCES "Temple"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberClassification"
  ADD CONSTRAINT "MemberClassification_templeId_fkey"
  FOREIGN KEY ("templeId") REFERENCES "Temple"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Member"
  ADD CONSTRAINT "Member_hierarchyId_fkey"
  FOREIGN KEY ("hierarchyId") REFERENCES "Hierarchy"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Member"
  ADD CONSTRAINT "Member_classificationId_fkey"
  FOREIGN KEY ("classificationId") REFERENCES "MemberClassification"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
