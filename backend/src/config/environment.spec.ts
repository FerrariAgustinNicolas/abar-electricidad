import { validateEnvironment } from './environment';

const databaseUrl = 'postgresql://abar_demo:fake-local-password@127.0.0.1:5432/abar_demo';

describe('validated local configuration', () => {
  it('defaults the API to loopback and port 3000', () => {
    expect(validateEnvironment({ DATABASE_URL: databaseUrl })).toEqual({
      DATABASE_URL: databaseUrl,
      HOST: '127.0.0.1',
      NODE_ENV: 'development',
      PORT: 3000,
      H4_ACCESS_TTL_SECONDS: 86400,
      H4_DEMO_SIMULATION_ENABLED: false,
      H4_REPLAY_KEY_BASE64: undefined,
      H4_ADMIN_NOTIFICATION_EMAIL: 'orders-admin@example.test',
      H6_SMTP_HOST: '127.0.0.1',
      H6_SMTP_PORT: 1025,
    });
  });

  it('accepts bounded H4 access settings and an independent 32-byte replay key', () => {
    const key = Buffer.alloc(32, 7).toString('base64');
    expect(validateEnvironment({ DATABASE_URL: databaseUrl, H4_ACCESS_TTL_SECONDS: '3600', H4_DEMO_SIMULATION_ENABLED: 'true', H4_REPLAY_KEY_BASE64: key })).toMatchObject({
      H4_ACCESS_TTL_SECONDS: 3600, H4_DEMO_SIMULATION_ENABLED: true, H4_REPLAY_KEY_BASE64: key,
    });
  });

  it.each([
    [{ H4_ACCESS_TTL_SECONDS: '59' }, 'H4_ACCESS_TTL_SECONDS'],
    [{ H4_ACCESS_TTL_SECONDS: '604801' }, 'H4_ACCESS_TTL_SECONDS'],
    [{ H4_DEMO_SIMULATION_ENABLED: 'yes' }, 'H4_DEMO_SIMULATION_ENABLED'],
    [{ H4_REPLAY_KEY_BASE64: 'not-a-key' }, 'H4_REPLAY_KEY_BASE64'],
  ])('rejects invalid H4 configuration (%s)', (extra, key) => {
    expect(() => validateEnvironment({ DATABASE_URL: databaseUrl, ...extra } as Record<string, unknown>)).toThrow(key);
  });

  it.each([
    [{ DATABASE_URL: 'mysql://localhost/db' }, 'DATABASE_URL'],
    [{ DATABASE_URL: databaseUrl, HOST: '0.0.0.0' }, 'HOST'],
    [{ DATABASE_URL: databaseUrl, PORT: '70000' }, 'PORT'],
    [{ DATABASE_URL: databaseUrl, NODE_ENV: 'staging' }, 'NODE_ENV'],
  ])('rejects an invalid configuration (%s)', (input, key) => {
    expect(() => validateEnvironment(input as Record<string, unknown>)).toThrow(key);
  });
});

describe('H6 local-only Mailpit configuration', () => {
  it('defaults to loopback Mailpit and a fictitious administrator recipient', () => {
    expect(validateEnvironment({ DATABASE_URL: databaseUrl })).toMatchObject({
      H6_SMTP_HOST: '127.0.0.1', H6_SMTP_PORT: 1025, H4_ADMIN_NOTIFICATION_EMAIL: 'orders-admin@example.test',
    });
  });
  it('allows an isolated loopback port without changing the SMTP destination host', () => {
    expect(validateEnvironment({ DATABASE_URL: databaseUrl, H6_SMTP_PORT: '56123' })).toMatchObject({H6_SMTP_HOST:'127.0.0.1', H6_SMTP_PORT:56123});
  });
  it.each([
    [{H6_SMTP_HOST:'smtp.external.invalid'}, 'H6_SMTP_HOST'],
    [{H6_SMTP_HOST:'localhost'}, 'H6_SMTP_HOST'],
    [{H6_SMTP_PORT:'0'}, 'H6_SMTP_PORT'],
    [{H6_SMTP_PORT:'65536'}, 'H6_SMTP_PORT'],
    [{H6_SMTP_PORT:'1.5'}, 'H6_SMTP_PORT'],
    [{H4_ADMIN_NOTIFICATION_EMAIL:'real@external.invalid'}, 'H4_ADMIN_NOTIFICATION_EMAIL'],
    [{H4_ADMIN_NOTIFICATION_EMAIL:'admin@example.test\r\nBcc: other@example.test'}, 'H4_ADMIN_NOTIFICATION_EMAIL'],
  ])('fails closed for unsafe SMTP or administrator configuration (%s)', (extra, field) => {
    expect(() => validateEnvironment({ DATABASE_URL: databaseUrl, ...extra })).toThrow(field);
  });
});
