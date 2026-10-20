export type AppEnvironment = {
  DATABASE_URL: string;
  HOST: '127.0.0.1';
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  H4_ACCESS_TTL_SECONDS: number;
  H4_DEMO_SIMULATION_ENABLED: boolean;
  H4_REPLAY_KEY_BASE64?: string;
};

function h4Integer(input: unknown, fallback: number, min: number, max: number, name: string): number {
  const value = input ?? String(fallback);
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return parsed;
}

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

  const accessTtl = h4Integer(input.H4_ACCESS_TTL_SECONDS, 86400, 60, 604800, 'H4_ACCESS_TTL_SECONDS');
  const rawSimulation = input.H4_DEMO_SIMULATION_ENABLED ?? 'false';
  if (rawSimulation !== 'true' && rawSimulation !== 'false' && typeof rawSimulation !== 'boolean') {
    throw new Error('H4_DEMO_SIMULATION_ENABLED must be true or false');
  }
  const simulationEnabled = rawSimulation === true || rawSimulation === 'true';
  const replayKey = input.H4_REPLAY_KEY_BASE64;
  if (replayKey !== undefined) {
    if (typeof replayKey !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(replayKey) || Buffer.from(replayKey, 'base64').byteLength !== 32 || Buffer.from(replayKey, 'base64').toString('base64') !== replayKey) {
      throw new Error('H4_REPLAY_KEY_BASE64 must encode exactly 32 bytes');
    }
  }

  return {
    DATABASE_URL: databaseUrl,
    HOST: '127.0.0.1',
    NODE_ENV: nodeEnv as AppEnvironment['NODE_ENV'],
    PORT: port,
    H4_ACCESS_TTL_SECONDS: accessTtl,
    H4_DEMO_SIMULATION_ENABLED: simulationEnabled,
    H4_REPLAY_KEY_BASE64: typeof replayKey === 'string' ? replayKey : undefined,
  };
}
