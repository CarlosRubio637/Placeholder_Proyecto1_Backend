-- CreateIndex
CREATE INDEX "assemblies_status_starts_at_idx" ON "assemblies"("status", "starts_at");

-- CreateIndex
CREATE INDEX "assemblies_status_ends_at_idx" ON "assemblies"("status", "ends_at");
