-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'OWNER_ADMIN';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isOwner" BOOLEAN NOT NULL DEFAULT false;
