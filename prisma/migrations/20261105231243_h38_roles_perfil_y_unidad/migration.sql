-- CreateEnum
CREATE TYPE "Role" AS ENUM ('RESIDENTE', 'ADMINISTRADOR', 'SEGURIDAD');

-- AlterTable
-- Las cuentas que ya existían (el usuario demo del boilerplate) quedan como
-- ADMINISTRADOR; después se quita el default para que el rol sea obligatorio.
ALTER TABLE "users" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'ADMINISTRADOR',
ADD COLUMN "unit_id" UUID;
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;

-- Un residente siempre tiene unidad (H38). Prisma no modela CHECK, por eso va
-- solo en la migración.
ALTER TABLE "users" ADD CONSTRAINT "users_residente_con_unidad_check"
  CHECK ("role" <> 'RESIDENTE' OR "unit_id" IS NOT NULL);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "full_name" VARCHAR(80) NOT NULL,
    "search_name" VARCHAR(80) NOT NULL,
    "phone" VARCHAR(9) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");

-- CreateIndex
CREATE INDEX "profiles_search_name_idx" ON "profiles"("search_name");

-- CreateIndex
CREATE INDEX "users_unit_id_idx" ON "users"("unit_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
