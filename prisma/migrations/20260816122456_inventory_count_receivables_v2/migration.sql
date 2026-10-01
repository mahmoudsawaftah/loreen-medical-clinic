/*
  Warnings:

  - Added the required column `totalActual` to the `DayClosing` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalExpected` to the `DayClosing` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalVariance` to the `DayClosing` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "InventoryCountStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'REVIEWED', 'POSTED');

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'PHYSICAL_COUNT_ADJUSTMENT';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "referrerCustomerId" TEXT,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceNote" TEXT;

-- AlterTable
ALTER TABLE "DayClosing" ADD COLUMN     "totalActual" DECIMAL(12,3) NOT NULL,
ADD COLUMN     "totalExpected" DECIMAL(12,3) NOT NULL,
ADD COLUMN     "totalVariance" DECIMAL(12,3) NOT NULL;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "referenceCountId" TEXT;

-- CreateTable
CREATE TABLE "CustomerSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCount" (
    "id" TEXT NOT NULL,
    "countNo" SERIAL NOT NULL,
    "countDate" TIMESTAMP(3) NOT NULL,
    "status" "InventoryCountStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "performedById" TEXT,
    "reviewedById" TEXT,
    "postedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCountLine" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT,
    "expectedQty" DECIMAL(12,3) NOT NULL,
    "countedQty" DECIMAL(12,3) NOT NULL,
    "difference" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "estimatedCostImpact" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSource_name_key" ON "CustomerSource"("name");

-- CreateIndex
CREATE INDEX "CustomerSource_active_idx" ON "CustomerSource"("active");

-- CreateIndex
CREATE INDEX "CustomerSource_sortOrder_idx" ON "CustomerSource"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCount_countNo_key" ON "InventoryCount"("countNo");

-- CreateIndex
CREATE INDEX "InventoryCount_status_idx" ON "InventoryCount"("status");

-- CreateIndex
CREATE INDEX "InventoryCount_countDate_idx" ON "InventoryCount"("countDate");

-- CreateIndex
CREATE INDEX "InventoryCount_createdById_idx" ON "InventoryCount"("createdById");

-- CreateIndex
CREATE INDEX "InventoryCountLine_countId_idx" ON "InventoryCountLine"("countId");

-- CreateIndex
CREATE INDEX "InventoryCountLine_productId_idx" ON "InventoryCountLine"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCountLine_countId_productId_batchId_key" ON "InventoryCountLine"("countId", "productId", "batchId");

-- CreateIndex
CREATE INDEX "Customer_sourceId_idx" ON "Customer"("sourceId");

-- CreateIndex
CREATE INDEX "StockMovement_referenceCountId_idx" ON "StockMovement"("referenceCountId");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "CustomerSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_referrerCustomerId_fkey" FOREIGN KEY ("referrerCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_referenceCountId_fkey" FOREIGN KEY ("referenceCountId") REFERENCES "InventoryCount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSource" ADD CONSTRAINT "CustomerSource_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "InventoryCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
