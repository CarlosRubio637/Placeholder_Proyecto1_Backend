-- CreateTable
CREATE TABLE "towers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "letter" CHAR(1) NOT NULL,

    CONSTRAINT "towers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "tower_id" UUID NOT NULL,
    "number" CHAR(3) NOT NULL,
    "code" VARCHAR(5) NOT NULL,
    "registration_code" CHAR(8) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "towers_name_key" ON "towers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "towers_letter_key" ON "towers"("letter");

-- CreateIndex
CREATE UNIQUE INDEX "units_code_key" ON "units"("code");

-- CreateIndex
CREATE UNIQUE INDEX "units_registration_code_key" ON "units"("registration_code");

-- CreateIndex
CREATE UNIQUE INDEX "units_tower_id_number_key" ON "units"("tower_id", "number");

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_tower_id_fkey" FOREIGN KEY ("tower_id") REFERENCES "towers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
