-- AlterTable
ALTER TABLE "visits" ADD COLUMN     "cancelled_by_id" UUID;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
