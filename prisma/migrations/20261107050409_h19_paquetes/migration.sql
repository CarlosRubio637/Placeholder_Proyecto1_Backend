-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('PENDIENTE_ENTREGA', 'ENTREGADO');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('DUI', 'PASAPORTE');

-- CreateTable
CREATE TABLE "packages" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "unit_id" UUID NOT NULL,
    "courier" VARCHAR(40) NOT NULL,
    "tracking_number" VARCHAR(40),
    "notes" VARCHAR(200),
    "status" "PackageStatus" NOT NULL DEFAULT 'PENDIENTE_ENTREGA',
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_by_id" UUID NOT NULL,
    "delivered_at" TIMESTAMP(3),
    "delivered_by_id" UUID,
    "picked_up_by_name" VARCHAR(80),
    "picked_up_by_doc_type" "DocumentType",
    "picked_up_by_doc_number" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_counters" (
    "day" CHAR(8) NOT NULL,
    "last" INTEGER NOT NULL,

    CONSTRAINT "package_counters_pkey" PRIMARY KEY ("day")
);

-- CreateIndex
CREATE UNIQUE INDEX "packages_code_key" ON "packages"("code");

-- CreateIndex
CREATE INDEX "packages_status_received_at_idx" ON "packages"("status", "received_at");

-- CreateIndex
CREATE INDEX "packages_unit_id_status_idx" ON "packages"("unit_id", "status");

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_delivered_by_id_fkey" FOREIGN KEY ("delivered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
