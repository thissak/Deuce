-- Retire access without deleting identities, messages, permissions or execution history.
-- Deploy with the previous server stopped so no old runner can claim new work.
BEGIN;
UPDATE "AgentConnection" SET "revokedAt" = CURRENT_TIMESTAMP WHERE "revokedAt" IS NULL;
UPDATE "User" SET "defaultAgentId" = NULL WHERE "defaultAgentId" IS NOT NULL;
UPDATE "AgentRun"
SET "status" = 'FAILED', "errorCode" = 'FEATURE_REMOVED', "finishedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'RUNNING';
COMMIT;
