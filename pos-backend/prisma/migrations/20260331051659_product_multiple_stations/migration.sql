/*
  Warnings:

  - You are about to drop the column `printer_route` on the `categories` table. All the data in the column will be lost.
  - You are about to drop the column `station_id` on the `products` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_station_id_fkey";

-- AlterTable
ALTER TABLE "categories" DROP COLUMN "printer_route";

-- AlterTable
ALTER TABLE "products" DROP COLUMN "station_id";

-- DropEnum
DROP TYPE "PrinterRoute";

-- CreateTable
CREATE TABLE "_KitchenStationToProduct" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_KitchenStationToProduct_AB_unique" ON "_KitchenStationToProduct"("A", "B");

-- CreateIndex
CREATE INDEX "_KitchenStationToProduct_B_index" ON "_KitchenStationToProduct"("B");

-- AddForeignKey
ALTER TABLE "_KitchenStationToProduct" ADD CONSTRAINT "_KitchenStationToProduct_A_fkey" FOREIGN KEY ("A") REFERENCES "kitchen_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_KitchenStationToProduct" ADD CONSTRAINT "_KitchenStationToProduct_B_fkey" FOREIGN KEY ("B") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
