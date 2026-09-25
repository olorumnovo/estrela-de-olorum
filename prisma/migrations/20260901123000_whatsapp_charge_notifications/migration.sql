CREATE TABLE "WhatsappChargeNotification" (
    "id" TEXT NOT NULL,
    "templeId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "notificationType" TEXT NOT NULL,
    "sentDateKey" TEXT NOT NULL,
    "memberId" TEXT,
    "memberName" TEXT,
    "phone" TEXT,
    "message" TEXT NOT NULL,
    "providerResponse" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappChargeNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsappChargeNotification_templeId_transactionId_notification_key" ON "WhatsappChargeNotification"("templeId", "transactionId", "notificationType", "sentDateKey");
CREATE INDEX "WhatsappChargeNotification_templeId_idx" ON "WhatsappChargeNotification"("templeId");
CREATE INDEX "WhatsappChargeNotification_transactionId_idx" ON "WhatsappChargeNotification"("transactionId");
CREATE INDEX "WhatsappChargeNotification_sentDateKey_idx" ON "WhatsappChargeNotification"("sentDateKey");

ALTER TABLE "WhatsappChargeNotification" ADD CONSTRAINT "WhatsappChargeNotification_templeId_fkey" FOREIGN KEY ("templeId") REFERENCES "Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;
