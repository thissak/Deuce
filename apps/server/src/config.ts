import { z } from 'zod';

const configSchema = z.object({
  DEUCE_DATABASE_URL: z.string().min(1),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3210),
});

export type ServerConfig = {
  databaseUrl: string;
  host: string;
  port: number;
};

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = configSchema.parse(environment);

  return {
    databaseUrl: parsed.DEUCE_DATABASE_URL,
    host: parsed.HOST,
    port: parsed.PORT,
  };
}
