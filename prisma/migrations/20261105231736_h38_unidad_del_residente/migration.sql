-- AlterTable
ALTER TABLE "users" ADD COLUMN     "unit_id" UUID;

-- CreateIndex
CREATE INDEX "users_unit_id_idx" ON "users"("unit_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un residente siempre tiene unidad (H38). Prisma no modela CHECK, por eso va
-- solo en la migración. Las cuentas que ya existen no son RESIDENTE (la
-- migración anterior de H38 las dejó como ADMINISTRADOR), así que el CHECK
-- no falla al aplicarse.
ALTER TABLE "users" ADD CONSTRAINT "users_residente_con_unidad_check"
  CHECK ("role" <> 'RESIDENTE' OR "unit_id" IS NOT NULL);
