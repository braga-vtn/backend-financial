-- AlterTable
ALTER TABLE "professionals" ADD COLUMN     "isCashbox" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "professionals_userId_isCashbox_idx" ON "professionals"("userId", "isCashbox");

CREATE UNIQUE INDEX "one_cashbox_per_user"
  ON "professionals" ("userId")
  WHERE "isCashbox" = true;
