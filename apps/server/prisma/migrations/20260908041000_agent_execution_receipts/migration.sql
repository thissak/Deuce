ALTER TABLE "Message" ADD COLUMN "system" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AgentConnection" ADD COLUMN "lastConnectedAt" TIMESTAMP(3);
CREATE TABLE "AgentRun" (
  "id" TEXT PRIMARY KEY,
  "agentId" TEXT NOT NULL REFERENCES "AgentConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "conversationId" TEXT NOT NULL REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "requestedById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "prompt" TEXT NOT NULL,
  "questionMessageId" TEXT NOT NULL UNIQUE,
  "resultMessageId" TEXT UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3)
);
CREATE INDEX "AgentRun_conversationId_createdAt_idx" ON "AgentRun"("conversationId", "createdAt");
CREATE UNIQUE INDEX "AgentRun_one_running_per_agent" ON "AgentRun"("agentId") WHERE "status" = 'RUNNING';
