-- CreateEnum
CREATE TYPE "FeeStatus" AS ENUM ('PENDIENTE', 'PAGADO', 'MOROSO');

-- CreateTable
CREATE TABLE "fee_generations" (
    "id" UUID NOT NULL,
    "period" CHAR(7) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "due_date" DATE NOT NULL,
    "concept" VARCHAR(60) NOT NULL,
    "created_count" INTEGER NOT NULL,
    "skipped_count" INTEGER NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fees" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "generation_id" UUID NOT NULL,
    "period" CHAR(7) NOT NULL,
    "concept" VARCHAR(60) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "FeeStatus" NOT NULL DEFAULT 'PENDIENTE',
    "paid_at" TIMESTAMP(3),
    "overdue_at" TIMESTAMP(3),
    "reminder_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fees_unit_id_period_key" ON "fees"("unit_id", "period");

-- AddForeignKey
ALTER TABLE "fee_generations" ADD CONSTRAINT "fee_generations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fees" ADD CONSTRAINT "fees_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fees" ADD CONSTRAINT "fees_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "fee_generations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fee_generations" ADD CONSTRAINT "fee_generations_amount_check"
  CHECK ("amount" > 0 AND "amount" <= 5000);

ALTER TABLE "fee_generations" ADD CONSTRAINT "fee_generations_counts_check"
  CHECK ("created_count" >= 0 AND "skipped_count" >= 0);

ALTER TABLE "fees" ADD CONSTRAINT "fees_amount_check"
  CHECK ("amount" > 0 AND "amount" <= 5000);
