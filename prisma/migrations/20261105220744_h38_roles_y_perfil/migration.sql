-- CreateEnum
CREATE TYPE "Role" AS ENUM ('RESIDENTE', 'ADMINISTRADOR', 'SEGURIDAD');

-- AlterTable
-- Las cuentas que ya existían (el usuario demo del boilerplate) quedan como
-- ADMINISTRADOR; después se quita el default para que el rol sea obligatorio.
ALTER TABLE "users" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'ADMINISTRADOR';
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;

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

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
