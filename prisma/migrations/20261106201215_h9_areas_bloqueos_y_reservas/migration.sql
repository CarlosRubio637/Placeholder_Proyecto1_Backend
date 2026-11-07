-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('CONFIRMADA', 'CANCELADA', 'CANCELADA_ADMIN');

-- CreateTable
CREATE TABLE "common_areas" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "name_key" VARCHAR(50) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "rules" VARCHAR(500),
    "open_time" CHAR(5) NOT NULL,
    "close_time" CHAR(5) NOT NULL,
    "slot_minutes" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "common_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "area_blocks" (
    "id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" VARCHAR(200) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "area_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "area_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "start_time" CHAR(5) NOT NULL,
    "end_time" CHAR(5) NOT NULL,
    "attendees" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMADA',
    "slot_key" VARCHAR(60),
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" UUID,
    "cancel_reason" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "common_areas_name_key_key" ON "common_areas"("name_key");

-- CreateIndex
CREATE INDEX "area_blocks_area_id_end_date_idx" ON "area_blocks"("area_id", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_code_key" ON "reservations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_slot_key_key" ON "reservations"("slot_key");

-- CreateIndex
CREATE INDEX "reservations_area_id_status_date_idx" ON "reservations"("area_id", "status", "date");

-- CreateIndex
CREATE INDEX "reservations_unit_id_status_idx" ON "reservations"("unit_id", "status");

-- AddForeignKey
ALTER TABLE "common_areas" ADD CONSTRAINT "common_areas_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_blocks" ADD CONSTRAINT "area_blocks_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "common_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_blocks" ADD CONSTRAINT "area_blocks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "common_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reglas de H9 y H7 que Prisma no modela; la base las garantiza aunque un
-- error de código las salte.
ALTER TABLE "common_areas"
  ADD CONSTRAINT "common_areas_capacity_check" CHECK ("capacity" BETWEEN 1 AND 500),
  ADD CONSTRAINT "common_areas_slot_minutes_check" CHECK ("slot_minutes" IN (60, 120)),
  ADD CONSTRAINT "common_areas_schedule_check" CHECK ("close_time" > "open_time");

ALTER TABLE "area_blocks"
  ADD CONSTRAINT "area_blocks_range_check" CHECK ("end_date" >= "start_date" AND "end_date" - "start_date" < 90);

-- slot_key solo existe mientras la reserva está confirmada: al cancelarla se
-- libera la franja.
ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_attendees_check" CHECK ("attendees" >= 1),
  ADD CONSTRAINT "reservations_slot_key_check" CHECK (("slot_key" IS NOT NULL) = ("status" = 'CONFIRMADA'));
