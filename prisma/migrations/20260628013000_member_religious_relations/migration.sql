ALTER TABLE "Member"
ADD COLUMN "fatherEntity1Id" TEXT,
ADD COLUMN "fatherEntity2Id" TEXT,
ADD COLUMN "motherEntity1Id" TEXT,
ADD COLUMN "motherEntity2Id" TEXT,
ADD COLUMN "contactTypeId" TEXT,
ADD COLUMN "religiousFunctionId" TEXT;

CREATE INDEX "Member_fatherEntity1Id_idx" ON "Member"("fatherEntity1Id");
CREATE INDEX "Member_fatherEntity2Id_idx" ON "Member"("fatherEntity2Id");
CREATE INDEX "Member_motherEntity1Id_idx" ON "Member"("motherEntity1Id");
CREATE INDEX "Member_motherEntity2Id_idx" ON "Member"("motherEntity2Id");
CREATE INDEX "Member_contactTypeId_idx" ON "Member"("contactTypeId");
CREATE INDEX "Member_religiousFunctionId_idx" ON "Member"("religiousFunctionId");

ALTER TABLE "Member"
ADD CONSTRAINT "Member_fatherEntity1Id_fkey"
FOREIGN KEY ("fatherEntity1Id")
REFERENCES "SpiritualEntity"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "Member"
ADD CONSTRAINT "Member_fatherEntity2Id_fkey"
FOREIGN KEY ("fatherEntity2Id")
REFERENCES "SpiritualEntity"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "Member"
ADD CONSTRAINT "Member_motherEntity1Id_fkey"
FOREIGN KEY ("motherEntity1Id")
REFERENCES "SpiritualEntity"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "Member"
ADD CONSTRAINT "Member_motherEntity2Id_fkey"
FOREIGN KEY ("motherEntity2Id")
REFERENCES "SpiritualEntity"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "Member"
ADD CONSTRAINT "Member_contactTypeId_fkey"
FOREIGN KEY ("contactTypeId")
REFERENCES "ContactType"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "Member"
ADD CONSTRAINT "Member_religiousFunctionId_fkey"
FOREIGN KEY ("religiousFunctionId")
REFERENCES "ReligiousFunction"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
