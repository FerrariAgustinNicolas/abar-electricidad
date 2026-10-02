import { validateEnvironment } from './environment';

const databaseUrl = 'postgresql://abar_demo:fake-local-password@127.0.0.1:5432/abar_demo';

describe('validated local configuration', () => {
  it('defaults the API to loopback and port 3000', () => {
    expect(validateEnvironment({ DATABASE_URL: databaseUrl })).toEqual({
      DATABASE_URL: databaseUrl,
      HOST: '127.0.0.1',
      NODE_ENV: 'development',
      PORT: 3000,
    });
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
