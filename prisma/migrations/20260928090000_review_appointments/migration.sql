ALTER TABLE "Visit" ADD COLUMN "scheduledAt" TIMESTAMP(3);

ALTER TABLE "FollowUpTask" ADD COLUMN "appointmentVisitId" TEXT;

CREATE INDEX "Visit_scheduledAt_idx" ON "Visit"("scheduledAt");

CREATE UNIQUE INDEX "FollowUpTask_appointmentVisitId_key" ON "FollowUpTask"("appointmentVisitId");

ALTER TABLE "FollowUpTask"
ADD CONSTRAINT "FollowUpTask_appointmentVisitId_fkey"
FOREIGN KEY ("appointmentVisitId") REFERENCES "Visit"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
