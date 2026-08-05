import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';

const config = loadConfig();
const { db, pool } = createDatabase(config.databaseUrl);
const app = buildApp({ db, pool });

const stop = async () => {
  await app.close();
  process.exit(0);
};

process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exit(1);
}
