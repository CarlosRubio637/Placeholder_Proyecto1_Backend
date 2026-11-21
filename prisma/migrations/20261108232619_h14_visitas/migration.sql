-- CreateEnum
CREATE TYPE "VisitOrigin" AS ENUM ('PREAUTORIZADA', 'SIN_AUTORIZACION_PREVIA');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('AUTORIZADA', 'PENDIENTE_AUTORIZACION', 'RECHAZADA', 'DENTRO', 'FINALIZADA', 'CANCELADA', 'VENCIDA');

-- CreateTable
CREATE TABLE "visits" (
    "id" UUID NOT NULL,
    "code" CHAR(6),
    "origin" "VisitOrigin" NOT NULL,
    "unit_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "visitor_name" VARCHAR(80) NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "document_number" VARCHAR(12) NOT NULL,
    "reason" VARCHAR(100) NOT NULL,
    "search_key" VARCHAR(100) NOT NULL,
    "visit_date" DATE NOT NULL,
    "expected_time" CHAR(5),
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "status" "VisitStatus" NOT NULL,
    "responded_by_id" UUID,
    "responded_at" TIMESTAMP(3),
    "reject_reason" VARCHAR(100),
    "entry_at" TIMESTAMP(3),
    "entry_by_id" UUID,
    "exit_at" TIMESTAMP(3),
    "exit_by_id" UUID,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "visits_code_key" ON "visits"("code");

-- CreateIndex
CREATE INDEX "visits_unit_id_visit_date_status_idx" ON "visits"("unit_id", "visit_date", "status");

-- CreateIndex
CREATE INDEX "visits_status_valid_until_idx" ON "visits"("status", "valid_until");

-- CreateIndex
CREATE INDEX "visits_search_key_idx" ON "visits"("search_key");

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_responded_by_id_fkey" FOREIGN KEY ("responded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_entry_by_id_fkey" FOREIGN KEY ("entry_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_exit_by_id_fkey" FOREIGN KEY ("exit_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
