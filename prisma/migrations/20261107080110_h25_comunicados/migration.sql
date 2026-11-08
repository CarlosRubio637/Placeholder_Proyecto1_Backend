-- CreateEnum
CREATE TYPE "AnnouncementCategory" AS ENUM ('CORTE_SERVICIO', 'MANTENIMIENTO', 'AVISO_GENERAL');

-- CreateEnum
CREATE TYPE "AudienceType" AS ENUM ('TODOS', 'TORRES');

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "category" "AnnouncementCategory" NOT NULL,
    "audience" "AudienceType" NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_on" DATE NOT NULL,
    "created_by_id" UUID NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_towers" (
    "announcement_id" UUID NOT NULL,
    "tower_id" UUID NOT NULL,

    CONSTRAINT "announcement_towers_pkey" PRIMARY KEY ("announcement_id","tower_id")
);

-- CreateTable
CREATE TABLE "announcement_recipients" (
    "id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "announcement_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcements_published_at_idx" ON "announcements"("published_at");

-- CreateIndex
CREATE INDEX "announcement_recipients_user_id_idx" ON "announcement_recipients"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_recipients_announcement_id_user_id_key" ON "announcement_recipients"("announcement_id", "user_id");

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_towers" ADD CONSTRAINT "announcement_towers_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_towers" ADD CONSTRAINT "announcement_towers_tower_id_fkey" FOREIGN KEY ("tower_id") REFERENCES "towers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "announcements" ADD CONSTRAINT "announcements_title_check" CHECK (char_length(btrim("title")) >= 5);
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_body_check" CHECK (char_length(btrim("body")) >= 10);
