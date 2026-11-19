-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('APROBADO', 'RECHAZADO');

-- AlterTable
ALTER TABLE "units" ADD COLUMN     "registration_code_updated_at" TIMESTAMP(3),
ADD COLUMN     "registration_code_updated_by_id" UUID;

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "fee_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "payer_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "failure_reason" VARCHAR(100),
    "transaction_number" VARCHAR(18) NOT NULL,
    "card_last4" CHAR(4) NOT NULL,
    "holder_name" VARCHAR(60) NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_transaction_number_key" ON "payments"("transaction_number");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_fee_id_created_at_idx" ON "payments"("fee_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_unit_id_idx" ON "payments"("unit_id");

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_registration_code_updated_by_id_fkey" FOREIGN KEY ("registration_code_updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_fee_id_fkey" FOREIGN KEY ("fee_id") REFERENCES "fees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- H1: reglas que Prisma no expresa en el esquema.
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK ("amount" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_card_last4_check" CHECK ("card_last4" ~ '^[0-9]{4}$');
-- Solo un pago APROBADO por cuota, aunque lleguen dos solicitudes a la vez.
CREATE UNIQUE INDEX "payments_one_approved_per_fee" ON "payments" ("fee_id") WHERE "status" = 'APROBADO';
-- El motivo de rechazo va solo en los rechazados.
ALTER TABLE "payments" ADD CONSTRAINT "payments_failure_reason_check"
  CHECK (("status" = 'RECHAZADO') = ("failure_reason" IS NOT NULL));
