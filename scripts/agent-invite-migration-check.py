"""Check upgrade compatibility in a newly created, disposable PostgreSQL database.
Usage: python3 scripts/agent-invite-migration-check.py --postgres-container CONTAINER
The specified container must be a local test PostgreSQL with a deuce role.
"""
import argparse
import json
from pathlib import Path
import subprocess
import uuid

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--postgres-container', required=True)
args = parser.parse_args()
database = 'deuce_ai_upgrade_' + uuid.uuid4().hex[:12]
container = args.postgres_container
root = Path(__file__).resolve().parent.parent


def command(*arguments, source=None):
    result = subprocess.run(['docker', 'exec', '-i', container, *arguments], input=source,
                            text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr)  # Only fixture SQL, never application credentials.
    return result.stdout


def sql(source):
    return command('psql', '-U', 'deuce', '-d', database, '-v', 'ON_ERROR_STOP=1', '-At', source=source)


command('createdb', '-U', 'deuce', database)
try:
    paths = sorted((root / 'apps/server/prisma/migrations').glob('*/migration.sql'))
    for path in paths:
        if path.parent.name < '20260908035000':
            sql(path.read_text())
    sql('''INSERT INTO "User" (id,email,name,"isAgent") VALUES
('owner','upgrade@example.test','Owner',false),('legacy-user','legacy@example.test','Legacy',true),
('all-user','all@example.test','All',true),('channels-user','channels@example.test','Channels',true);
INSERT INTO "Conversation" (id,type,title) VALUES ('room','CHANNEL','Preserved');
INSERT INTO "ConversationMember" ("conversationId","userId") VALUES ('room','owner'),('room','legacy-user');
INSERT INTO "Message" (id,"conversationId","authorId",body) VALUES ('msg','room','owner','preserve me');
INSERT INTO "AgentConnection" (id,"conversationId",scope,"ownerId","userId","tokenHash","expiresAt") VALUES
('legacy','room','CHANNELS','owner','legacy-user','legacy-hash',now()+interval '90 days'),
('all',NULL,'ALL','owner','all-user','all-hash',now()+interval '90 days'),
('channels',NULL,'CHANNELS','owner','channels-user','channels-hash',now()+interval '90 days');
INSERT INTO "AgentConversationExclusion" ("agentId","conversationId") VALUES ('all','room');''')
    snapshot = '''SELECT id,scope,"conversationId","tokenHash" FROM "AgentConnection" ORDER BY id;
SELECT * FROM "ConversationMember" ORDER BY "userId"; SELECT id,body FROM "Message";
SELECT * FROM "AgentConversationExclusion";'''
    before = sql(snapshot)
    for path in paths:
        if path.parent.name >= '20260908035000':
            sql(path.read_text())
    assert before == sql(snapshot)
    assert sql('SELECT count(*) FROM "AgentConversationGrant"; SELECT count(*) FROM "AgentRun";').strip() == '0\n0'
    assert 'SELECTED' in sql("SELECT column_default FROM information_schema.columns WHERE table_name='AgentConnection' AND column_name='scope';")
    print(json.dumps({'result': 'PASS', 'checks': ['legacy/ALL/CHANNELS rows unchanged',
        'key hashes/messages/membership/exclusions preserved', 'no implicit room grants', 'new default SELECTED']}))
finally:
    command('dropdb', '-U', 'deuce', database)
