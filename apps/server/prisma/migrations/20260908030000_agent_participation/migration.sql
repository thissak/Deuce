CREATE TYPE "AgentScope" AS ENUM ('CHANNELS', 'ALL');
ALTER TABLE "AgentConnection" ALTER COLUMN "conversationId" DROP NOT NULL;
ALTER TABLE "AgentConnection" ADD COLUMN "scope" "AgentScope" NOT NULL DEFAULT 'CHANNELS';
CREATE INDEX "AgentConnection_ownerId_idx" ON "AgentConnection"("ownerId");
CREATE TABLE "AgentConversationExclusion" (
    "agentId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    CONSTRAINT "AgentConversationExclusion_pkey" PRIMARY KEY ("agentId", "conversationId")
);
CREATE INDEX "AgentConversationExclusion_conversationId_idx" ON "AgentConversationExclusion"("conversationId");
ALTER TABLE "AgentConversationExclusion" ADD CONSTRAINT "AgentConversationExclusion_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "AgentConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentConversationExclusion" ADD CONSTRAINT "AgentConversationExclusion_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
