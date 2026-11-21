-- CreateEnum
CREATE TYPE "SourceModule" AS ENUM ('CUOTAS', 'RESERVAS', 'INCIDENCIAS', 'VISITAS', 'PAQUETERIA', 'VOTACIONES', 'COMUNICADOS');

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "source_module" "SourceModule" NOT NULL,
    "reference_type" VARCHAR(30),
    "reference_id" UUID,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
