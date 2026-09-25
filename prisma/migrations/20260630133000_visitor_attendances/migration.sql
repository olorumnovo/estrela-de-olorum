CREATE TABLE "VisitorAttendance" (
  "id" TEXT NOT NULL,
  "templeId" TEXT NOT NULL,
  "data" DATE NOT NULL,
  "gira" TEXT NOT NULL,
  "quantidade" INTEGER NOT NULL,
  "observacoes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "VisitorAttendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VisitorAttendance_templeId_data_gira_key"
  ON "VisitorAttendance" ("templeId", "data", "gira");

CREATE INDEX "VisitorAttendance_templeId_data_idx"
  ON "VisitorAttendance" ("templeId", "data");

CREATE INDEX "VisitorAttendance_templeId_gira_idx"
  ON "VisitorAttendance" ("templeId", "gira");

ALTER TABLE "VisitorAttendance"
  ADD CONSTRAINT "VisitorAttendance_templeId_fkey"
  FOREIGN KEY ("templeId") REFERENCES "Temple"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
