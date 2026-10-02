export type AppEnvironment = {
  DATABASE_URL: string;
  HOST: '127.0.0.1';
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
};

export function validateEnvironment(input: Record<string, unknown>): AppEnvironment {
  const databaseUrl = input.DATABASE_URL;
  if (typeof databaseUrl !== 'string') {
    throw new Error('DATABASE_URL must be a PostgreSQL URL');
  }

  let parsedDatabaseUrl: URL;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol)) {
    throw new Error('DATABASE_URL must be a PostgreSQL URL');
  }

  const host = input.HOST ?? '127.0.0.1';
  if (host !== '127.0.0.1') {
    throw new Error('HOST must be 127.0.0.1 for the local backend');
  }

  const nodeEnv = input.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(String(nodeEnv))) {
    throw new Error('NODE_ENV must be development, test, or production');
  }

  const rawPort = input.PORT ?? '3000';
  const port = typeof rawPort === 'number' ? rawPort : Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  return {
    DATABASE_URL: databaseUrl,
    HOST: '127.0.0.1',
    NODE_ENV: nodeEnv as AppEnvironment['NODE_ENV'],
    PORT: port,
  };
}
