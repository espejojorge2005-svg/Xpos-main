/*
  Warnings:

  - You are about to drop the column `plan_type` on the `restaurants` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "restaurants" DROP COLUMN "plan_type",
ADD COLUMN     "plan_id" UUID;

-- DropEnum
DROP TYPE "PlanType";

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "maxUsers" INTEGER NOT NULL DEFAULT 3,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_code_key" ON "subscription_plans"("code");

-- AddForeignKey
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
