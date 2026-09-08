-- Existing rows keep CHANNELS/ALL. Only new connections default to explicit invites.
ALTER TABLE "AgentConnection" ALTER COLUMN "scope" SET DEFAULT 'SELECTED';
ALTER TABLE "User" ADD COLUMN "defaultAgentId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_defaultAgentId_fkey" FOREIGN KEY ("defaultAgentId") REFERENCES "AgentConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "AgentConversationGrant" (
  "agentId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  CONSTRAINT "AgentConversationGrant_pkey" PRIMARY KEY ("agentId", "conversationId"),
  CONSTRAINT "AgentConversationGrant_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AgentConversationGrant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AgentConversationGrant_conversationId_idx" ON "AgentConversationGrant"("conversationId");
