-- DropIndex: remove unique constraint allowing multiple sessions per day
DROP INDEX "attendances_employeeId_date_key";

-- AlterTable: rename latitude/longitude to clockIn-prefixed, add clockOut geo fields
ALTER TABLE "attendances"
  RENAME COLUMN "latitude" TO "clockInLatitude";

ALTER TABLE "attendances"
  RENAME COLUMN "longitude" TO "clockInLongitude";

ALTER TABLE "attendances"
  ADD COLUMN "clockOutLatitude" DOUBLE PRECISION,
  ADD COLUMN "clockOutLongitude" DOUBLE PRECISION;

-- CreateTable: LeaveBalance
CREATE TABLE "leave_balances" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leaveType" "LeaveType" NOT NULL,
    "totalDays" INTEGER NOT NULL DEFAULT 0,
    "usedDays" INTEGER NOT NULL DEFAULT 0,
    "pendingDays" INTEGER NOT NULL DEFAULT 0,
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: one balance per employee per leave type per year
CREATE UNIQUE INDEX "leave_balances_employeeId_leaveType_year_key" ON "leave_balances"("employeeId", "leaveType", "year");

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
