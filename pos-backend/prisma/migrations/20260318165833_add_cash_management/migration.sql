/*
  Warnings:

  - You are about to alter the column `price` on the `products` table. The data in that column could be lost. The data in that column will be cast from `Decimal(10,2)` to `DoublePrecision`.
  - Added the required column `updated_at` to the `products` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "products" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "minStock" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stock" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "price" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "tables" ALTER COLUMN "number" SET DATA TYPE TEXT;

-- CreateTable
CREATE TABLE "cash_shifts" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "opening_amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "cash_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_expenses" (
    "id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_expenses_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "cash_expenses" ADD CONSTRAINT "cash_expenses_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "cash_shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
