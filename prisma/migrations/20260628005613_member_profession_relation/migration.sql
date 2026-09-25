/*
  Warnings:

  - You are about to drop the column `profissao` on the `Member` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Member" DROP COLUMN "profissao",
ADD COLUMN     "professionId" TEXT;

-- CreateIndex
CREATE INDEX "Member_professionId_idx" ON "Member"("professionId");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_professionId_fkey" FOREIGN KEY ("professionId") REFERENCES "Profession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
