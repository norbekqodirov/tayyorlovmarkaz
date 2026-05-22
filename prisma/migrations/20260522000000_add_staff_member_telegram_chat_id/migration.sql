-- AlterTable: add telegramChatId to StaffMember
ALTER TABLE "StaffMember" ADD COLUMN "telegramChatId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StaffMember_telegramChatId_key" ON "StaffMember"("telegramChatId");

-- CreateIndex
CREATE INDEX "StaffMember_telegramChatId_idx" ON "StaffMember"("telegramChatId");
