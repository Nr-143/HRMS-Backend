-- AlterTable: add rejectionReason and requestedDays to leaves
ALTER TABLE "leaves"
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "requestedDays"   INTEGER NOT NULL DEFAULT 1;
