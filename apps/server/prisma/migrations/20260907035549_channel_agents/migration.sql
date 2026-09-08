-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isAgent" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AgentConnection" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AgentConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentConnection_userId_key" ON "AgentConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentConnection_tokenHash_key" ON "AgentConnection"("tokenHash");

-- CreateIndex
CREATE INDEX "AgentConnection_conversationId_idx" ON "AgentConnection"("conversationId");

-- AddForeignKey
ALTER TABLE "AgentConnection" ADD CONSTRAINT "AgentConnection_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentConnection" ADD CONSTRAINT "AgentConnection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentConnection" ADD CONSTRAINT "AgentConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
