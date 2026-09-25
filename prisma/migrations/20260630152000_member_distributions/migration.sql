CREATE TABLE "MemberDistribution" (
  "id" TEXT NOT NULL,
  "templeId" TEXT NOT NULL,
  "data" DATE NOT NULL,
  "layout" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "MemberDistribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemberDistribution_templeId_data_key"
  ON "MemberDistribution" ("templeId", "data");

CREATE INDEX "MemberDistribution_templeId_data_idx"
  ON "MemberDistribution" ("templeId", "data");

ALTER TABLE "MemberDistribution"
  ADD CONSTRAINT "MemberDistribution_templeId_fkey"
  FOREIGN KEY ("templeId") REFERENCES "Temple"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
