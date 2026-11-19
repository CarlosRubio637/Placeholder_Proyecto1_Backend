-- H24: los conteos del resultado nunca son negativos. Prisma no genera CHECK,
-- por eso van en esta migración escrita a mano.
ALTER TABLE "topic_results"
  ADD CONSTRAINT "topic_results_eligible_units_check" CHECK ("eligible_units" >= 0),
  ADD CONSTRAINT "topic_results_voted_units_check" CHECK ("voted_units" >= 0),
  ADD CONSTRAINT "topic_results_total_votes_check" CHECK ("total_votes" >= 0);
