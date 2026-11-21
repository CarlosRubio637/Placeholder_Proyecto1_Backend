-- CreateTable
CREATE TABLE "vote_participations" (
    "id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "voted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vote_participations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ballots" (
    "id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,

    CONSTRAINT "ballots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vote_participations_unit_id_idx" ON "vote_participations"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "vote_participations_topic_id_unit_id_key" ON "vote_participations"("topic_id", "unit_id");

-- CreateIndex
CREATE INDEX "ballots_topic_id_option_id_idx" ON "ballots"("topic_id", "option_id");

-- AddForeignKey
ALTER TABLE "vote_participations" ADD CONSTRAINT "vote_participations_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "assembly_topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_participations" ADD CONSTRAINT "vote_participations_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_participations" ADD CONSTRAINT "vote_participations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "assembly_topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "topic_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
