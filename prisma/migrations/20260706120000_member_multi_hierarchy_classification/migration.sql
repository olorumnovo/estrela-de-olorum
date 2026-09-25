-- CreateTable
CREATE TABLE "MemberHierarchy" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "hierarchyId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberHierarchy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberClassificationLink" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "classificationId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberClassificationLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberHierarchy_memberId_hierarchyId_key" ON "MemberHierarchy"("memberId", "hierarchyId");

-- CreateIndex
CREATE INDEX "MemberHierarchy_memberId_idx" ON "MemberHierarchy"("memberId");

-- CreateIndex
CREATE INDEX "MemberHierarchy_hierarchyId_idx" ON "MemberHierarchy"("hierarchyId");

-- CreateIndex
CREATE INDEX "MemberHierarchy_memberId_order_idx" ON "MemberHierarchy"("memberId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "MemberClassificationLink_memberId_classificationId_key" ON "MemberClassificationLink"("memberId", "classificationId");

-- CreateIndex
CREATE INDEX "MemberClassificationLink_memberId_idx" ON "MemberClassificationLink"("memberId");

-- CreateIndex
CREATE INDEX "MemberClassificationLink_classificationId_idx" ON "MemberClassificationLink"("classificationId");

-- CreateIndex
CREATE INDEX "MemberClassificationLink_memberId_order_idx" ON "MemberClassificationLink"("memberId", "order");

-- Backfill
INSERT INTO "MemberHierarchy" ("id", "memberId", "hierarchyId", "order", "createdAt")
SELECT "id" || '-' || "hierarchyId", "id", "hierarchyId", 0, CURRENT_TIMESTAMP
FROM "Member"
WHERE "hierarchyId" IS NOT NULL;

INSERT INTO "MemberClassificationLink" ("id", "memberId", "classificationId", "order", "createdAt")
SELECT "id" || '-' || "classificationId", "id", "classificationId", 0, CURRENT_TIMESTAMP
FROM "Member"
WHERE "classificationId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "MemberHierarchy" ADD CONSTRAINT "MemberHierarchy_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberHierarchy" ADD CONSTRAINT "MemberHierarchy_hierarchyId_fkey" FOREIGN KEY ("hierarchyId") REFERENCES "Hierarchy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberClassificationLink" ADD CONSTRAINT "MemberClassificationLink_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberClassificationLink" ADD CONSTRAINT "MemberClassificationLink_classificationId_fkey" FOREIGN KEY ("classificationId") REFERENCES "MemberClassification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
