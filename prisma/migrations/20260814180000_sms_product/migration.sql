-- AlterTable
ALTER TABLE "SmsSetting" ADD COLUMN "storeName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SmsSetting" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'twilio';
ALTER TABLE "SmsSetting" ADD COLUMN "encryptedCredentials" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SmsSetting" ADD COLUMN "fromNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SmsSetting" ADD COLUMN "countryCode" TEXT NOT NULL DEFAULT 'IN';
ALTER TABLE "SmsSetting" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';
ALTER TABLE "SmsSetting" ADD COLUMN "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SmsSetting" ADD COLUMN "quietHoursStart" TEXT NOT NULL DEFAULT '21:00';
ALTER TABLE "SmsSetting" ADD COLUMN "quietHoursEnd" TEXT NOT NULL DEFAULT '08:00';
ALTER TABLE "SmsSetting" ADD COLUMN "addOrderNote" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SmsSetting" ADD COLUMN "includeOptOutText" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SmsSetting" ADD COLUMN "testSent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SmsSetting" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'free';
ALTER TABLE "SmsSetting" ADD COLUMN "smsUsedThisPeriod" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SmsSetting" ADD COLUMN "periodStart" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "SmsSetting" ADD COLUMN "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "SmsTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "body" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "SmsTemplate_shop_eventType_key" ON "SmsTemplate"("shop", "eventType");

-- Recreate SmsLog with product fields
CREATE TABLE "new_SmsLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "eventType" TEXT NOT NULL DEFAULT 'order_confirmed',
    "orderId" TEXT,
    "orderName" TEXT,
    "to" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "provider" TEXT,
    "providerId" TEXT,
    "error" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "sendAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "new_SmsLog" ("id", "shop", "eventType", "orderId", "to", "body", "status", "dedupeKey", "createdAt")
SELECT "id", "shop", 'order_confirmed', "orderId", "to", "body", "status", "id", "createdAt" FROM "SmsLog";

DROP TABLE "SmsLog";
ALTER TABLE "new_SmsLog" RENAME TO "SmsLog";
CREATE UNIQUE INDEX "SmsLog_shop_dedupeKey_key" ON "SmsLog"("shop", "dedupeKey");
CREATE INDEX "SmsLog_shop_createdAt_idx" ON "SmsLog"("shop", "createdAt");
CREATE INDEX "SmsLog_shop_status_idx" ON "SmsLog"("shop", "status");

-- CreateTable
CREATE TABLE "SmsOptOut" (
    "shop" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("shop", "phone")
);
