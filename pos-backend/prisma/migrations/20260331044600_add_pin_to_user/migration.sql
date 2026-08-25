-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('SALE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('BASIC', 'PRO', 'PREMIUM');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';

-- AlterTable
ALTER TABLE "cash_shifts" ADD COLUMN     "restaurant_id" UUID;

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "restaurant_id" UUID;

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "restaurant_id" UUID;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "is_paid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parent_item_id" UUID,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "previous_table_name" TEXT,
ADD COLUMN     "restaurant_id" UUID;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "restaurant_id" UUID,
ADD COLUMN     "station_id" UUID;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "allowed_views" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "pin" TEXT,
ADD COLUMN     "restaurant_id" UUID;

-- AlterTable
ALTER TABLE "zones" ADD COLUMN     "restaurant_id" UUID;

-- CreateTable
CREATE TABLE "kitchen_stations" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID,
    "name" TEXT NOT NULL,
    "color_hex" TEXT,
    "printer_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kitchen_stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifier_groups" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "product_id" UUID NOT NULL,
    "min_select" INTEGER NOT NULL DEFAULT 0,
    "max_select" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modifier_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifier_options" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "target_product_id" UUID NOT NULL,
    "price_override" DECIMAL(10,2),

    CONSTRAINT "modifier_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "delta" INTEGER NOT NULL,
    "stock_before" INTEGER NOT NULL,
    "stock_after" INTEGER NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Mi Restaurante',
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "slogan" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "ruc" TEXT,
    "logo_url" TEXT,
    "plan_type" "PlanType" NOT NULL DEFAULT 'BASIC',
    "subscription_end_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "owner_name" TEXT,
    "owner_phone" TEXT,
    "internal_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kitchen_stations_restaurant_id_name_key" ON "kitchen_stations"("restaurant_id", "name");

-- CreateIndex
CREATE INDEX "stock_movements_created_at_idx" ON "stock_movements"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_slug_key" ON "restaurants"("slug");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_status_idx" ON "order_items"("status");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_updated_at_idx" ON "orders"("updated_at");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "kitchen_stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_stations" ADD CONSTRAINT "kitchen_stations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_options" ADD CONSTRAINT "modifier_options_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_options" ADD CONSTRAINT "modifier_options_target_product_id_fkey" FOREIGN KEY ("target_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_parent_item_id_fkey" FOREIGN KEY ("parent_item_id") REFERENCES "order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
