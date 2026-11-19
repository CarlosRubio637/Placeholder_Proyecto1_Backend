-- CreateTable
CREATE TABLE "topic_results" (
    "id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "eligible_units" INTEGER NOT NULL,
    "voted_units" INTEGER NOT NULL,
    "total_votes" INTEGER NOT NULL,
    "option_counts" JSONB NOT NULL,
    "winner_option_id" UUID,
    "computed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topic_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "topic_results_topic_id_key" ON "topic_results"("topic_id");

-- AddForeignKey
ALTER TABLE "topic_results" ADD CONSTRAINT "topic_results_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "assembly_topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
