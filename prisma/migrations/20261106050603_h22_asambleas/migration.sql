-- CreateEnum
CREATE TYPE "AssemblyStatus" AS ENUM ('PROGRAMADA', 'ABIERTA', 'CERRADA');

-- CreateTable
CREATE TABLE "assemblies" (
    "id" UUID NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "description" VARCHAR(1000),
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "AssemblyStatus" NOT NULL DEFAULT 'PROGRAMADA',
    "opened_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assemblies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assembly_topics" (
    "id" UUID NOT NULL,
    "assembly_id" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "question" VARCHAR(200) NOT NULL,

    CONSTRAINT "assembly_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_options" (
    "id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "text" VARCHAR(80) NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "topic_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assembly_eligible_units" (
    "assembly_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,

    CONSTRAINT "assembly_eligible_units_pkey" PRIMARY KEY ("assembly_id","unit_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assembly_topics_assembly_id_order_key" ON "assembly_topics"("assembly_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "topic_options_topic_id_text_key" ON "topic_options"("topic_id", "text");

-- AddForeignKey
ALTER TABLE "assemblies" ADD CONSTRAINT "assemblies_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_topics" ADD CONSTRAINT "assembly_topics_assembly_id_fkey" FOREIGN KEY ("assembly_id") REFERENCES "assemblies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_options" ADD CONSTRAINT "topic_options_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "assembly_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_eligible_units" ADD CONSTRAINT "assembly_eligible_units_assembly_id_fkey" FOREIGN KEY ("assembly_id") REFERENCES "assemblies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_eligible_units" ADD CONSTRAINT "assembly_eligible_units_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
