-- CreateEnum
CREATE TYPE "IncidentLocation" AS ENUM ('TORRE_A', 'TORRE_B', 'TORRE_C', 'ESTACIONAMIENTO', 'PISCINA', 'GIMNASIO', 'SALON', 'ASADOR', 'LOBBY', 'AREAS_VERDES', 'OTRA');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'RESUELTO');

-- CreateEnum
CREATE TYPE "IncidentPriority" AS ENUM ('BAJA', 'MEDIA', 'ALTA');

-- CreateEnum
CREATE TYPE "IncidentEventType" AS ENUM ('CREACION', 'ESTADO', 'PRIORIDAD', 'ASIGNACION');

-- CreateTable
CREATE TABLE "maintenance_staff" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "specialty" VARCHAR(40) NOT NULL,
    "phone" VARCHAR(9) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL,
    "number" VARCHAR(14) NOT NULL,
    "unit_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "location" "IncidentLocation" NOT NULL,
    "location_detail" VARCHAR(100),
    "search_key" VARCHAR(100) NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'PENDIENTE',
    "priority" "IncidentPriority" NOT NULL DEFAULT 'MEDIA',
    "assignee_id" UUID,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_photos" (
    "id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "path" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(20) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_events" (
    "id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "type" "IncidentEventType" NOT NULL,
    "from_status" "IncidentStatus",
    "to_status" "IncidentStatus",
    "from_value" VARCHAR(100),
    "to_value" VARCHAR(100),
    "note" VARCHAR(500),
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_counters" (
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL,

    CONSTRAINT "incident_counters_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE UNIQUE INDEX "incidents_number_key" ON "incidents"("number");

-- CreateIndex
CREATE INDEX "incidents_unit_id_created_at_idx" ON "incidents"("unit_id", "created_at");

-- CreateIndex
CREATE INDEX "incidents_status_priority_created_at_idx" ON "incidents"("status", "priority", "created_at");

-- CreateIndex
CREATE INDEX "incident_photos_incident_id_idx" ON "incident_photos"("incident_id");

-- CreateIndex
CREATE INDEX "incident_events_incident_id_created_at_idx" ON "incident_events"("incident_id", "created_at");

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "maintenance_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_photos" ADD CONSTRAINT "incident_photos_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
