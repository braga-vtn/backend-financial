-- CreateEnum
CREATE TYPE "TokenType" AS ENUM ('refresh', 'register');

-- CreateTable
CREATE TABLE "Token" (
    "id" SERIAL NOT NULL,
    "type" "TokenType" NOT NULL,
    "token" TEXT NOT NULL,
    "payload" JSONB,
    "expires" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Token_token_key" ON "Token"("token");

-- AddForeignKey
ALTER TABLE "Token" ADD CONSTRAINT "Token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("clerkId") ON DELETE CASCADE ON UPDATE CASCADE;
