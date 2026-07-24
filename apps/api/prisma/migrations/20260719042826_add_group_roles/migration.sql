/*
  Warnings:

  - You are about to drop the column `is_manager` on the `group_users` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "GroupRole" AS ENUM ('OWNER', 'ADMIN', 'USER');

-- AlterTable
ALTER TABLE "group_users" DROP COLUMN "is_manager",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "role" "GroupRole" NOT NULL DEFAULT 'USER';
