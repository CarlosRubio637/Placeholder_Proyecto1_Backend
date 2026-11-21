-- CreateTable
CREATE TABLE "directory_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT false,
    "show_name" BOOLEAN NOT NULL DEFAULT false,
    "show_unit" BOOLEAN NOT NULL DEFAULT false,
    "show_phone" BOOLEAN NOT NULL DEFAULT false,
    "show_email" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "directory_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "directory_preferences_user_id_key" ON "directory_preferences"("user_id");

-- AddForeignKey
ALTER TABLE "directory_preferences" ADD CONSTRAINT "directory_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "directory_preferences" ADD CONSTRAINT "directory_preferences_name_check" CHECK (NOT "visible" OR "show_name");
