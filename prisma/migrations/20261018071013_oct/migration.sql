/*
  Warnings:

  - A unique constraint covering the columns `[hodId]` on the table `departments` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeaveStatus" ADD VALUE 'L1_APPROVED';
ALTER TYPE "LeaveStatus" ADD VALUE 'L2_APPROVED';

-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "hodId" TEXT;

-- AlterTable
ALTER TABLE "leaves" ADD COLUMN     "currentApprovalLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalApprovalLevels" INTEGER NOT NULL DEFAULT 2;

-- CreateTable
CREATE TABLE "leave_approval_logs" (
    "id" TEXT NOT NULL,
    "leaveId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "approverRole" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "actedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "leave_approval_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_reporting_history" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "oldManagerId" TEXT,
    "newManagerId" TEXT,
    "changedById" TEXT NOT NULL,
    "reason" TEXT,
    "reassignedLeaveCount" INTEGER NOT NULL DEFAULT 0,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "employee_reporting_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_quotes" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_hodId_key" ON "departments"("hodId");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_hodId_fkey" FOREIGN KEY ("hodId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approval_logs" ADD CONSTRAINT "leave_approval_logs_leaveId_fkey" FOREIGN KEY ("leaveId") REFERENCES "leaves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approval_logs" ADD CONSTRAINT "leave_approval_logs_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approval_logs" ADD CONSTRAINT "leave_approval_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_reporting_history" ADD CONSTRAINT "employee_reporting_history_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_reporting_history" ADD CONSTRAINT "employee_reporting_history_oldManagerId_fkey" FOREIGN KEY ("oldManagerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_reporting_history" ADD CONSTRAINT "employee_reporting_history_newManagerId_fkey" FOREIGN KEY ("newManagerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_reporting_history" ADD CONSTRAINT "employee_reporting_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_reporting_history" ADD CONSTRAINT "employee_reporting_history_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_quotes" ADD CONSTRAINT "daily_quotes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
