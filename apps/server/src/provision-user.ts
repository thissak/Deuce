import { parseArgs } from 'node:util';

import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { channelMemberships, users } from './db/schema.js';

const { values } = parseArgs({
  options: {
    subject: { type: 'string' },
    name: { type: 'string' },
    admin: { type: 'boolean' },
  },
  strict: true,
});

const subject = values.subject?.trim();
const displayName = values.name?.trim();
if (!subject || !displayName) {
  throw new Error(
    'Usage: npm run user:provision -- --subject <oidc-sub> --name <display-name> [--admin]',
  );
}

const config = loadConfig();
const { db, pool } = createDatabase(config.databaseUrl);

try {
  const adminValues =
    values.admin === undefined ? {} : { isAdmin: values.admin };
  const [user] = await db
    .insert(users)
    .values({
      oidcIssuer: config.oidc.issuer,
      oidcSubject: subject,
      displayName,
      ...adminValues,
    })
    .onConflictDoUpdate({
      target: [users.oidcIssuer, users.oidcSubject],
      set: {
        displayName,
        disabledAt: null,
        ...adminValues,
      },
    })
    .returning({ id: users.id });

  if (!user) throw new Error('User provisioning returned no user');

  await db
    .insert(channelMemberships)
    .values({ userId: user.id, channelId: 'general' })
    .onConflictDoNothing();

  console.log(`Provisioned Deuce user ${displayName} in #general.`);
} finally {
  await pool.end();
}
