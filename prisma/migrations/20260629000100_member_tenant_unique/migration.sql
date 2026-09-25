-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Member_id_templeId_key" ON "Member"("id", "templeId");
