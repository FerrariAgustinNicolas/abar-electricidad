import { AuthConfig, validateAuthConfig } from './auth.config';

const defaults: AuthConfig = {
  allowedOrigins: ['http://127.0.0.1:4200', 'http://localhost:4200'],
  cookieSecure: false,
  sessionAbsoluteSeconds: 28800,
  sessionIdleSeconds: 1800,
  preAuthSeconds: 900,
  loginIpLimit: 10,
  loginIpWindowSeconds: 60,
  loginAccountLimit: 10,
  loginAccountWindowSeconds: 900,
  csrfIpLimit: 30,
  csrfIpWindowSeconds: 60,
  argon2Concurrency: 1,
  argon2QueueLimit: 16,
};

const numericSettings = [
  ['AUTH_SESSION_ABSOLUTE_SECONDS', 'sessionAbsoluteSeconds', 60, 86400],
  ['AUTH_SESSION_IDLE_SECONDS', 'sessionIdleSeconds', 30, 14400],
  ['AUTH_PREAUTH_SECONDS', 'preAuthSeconds', 30, 1800],
  ['AUTH_LOGIN_IP_LIMIT', 'loginIpLimit', 1, 1000],
  ['AUTH_LOGIN_IP_WINDOW_SECONDS', 'loginIpWindowSeconds', 1, 3600],
  ['AUTH_LOGIN_ACCOUNT_LIMIT', 'loginAccountLimit', 1, 1000],
  ['AUTH_LOGIN_ACCOUNT_WINDOW_SECONDS', 'loginAccountWindowSeconds', 1, 3600],
  ['AUTH_CSRF_IP_LIMIT', 'csrfIpLimit', 1, 1000],
  ['AUTH_CSRF_IP_WINDOW_SECONDS', 'csrfIpWindowSeconds', 1, 3600],
  ['AUTH_ARGON2_CONCURRENCY', 'argon2Concurrency', 1, 4],
  ['AUTH_ARGON2_QUEUE_LIMIT', 'argon2QueueLimit', 0, 64],
] as const;

function errorMessage(input: Record<string, unknown>): string {
  try {
    validateAuthConfig(input);
  } catch (error) {
    if (error instanceof Error) return error.message;
    throw error;
  }
  throw new Error('Expected configuration rejection');
}

describe('standalone authentication configuration', () => {
  it.each([undefined, 'development', 'test'])('uses frozen defaults in %s', (nodeEnv) => {
    expect(validateAuthConfig({ NODE_ENV: nodeEnv })).toEqual(defaults);
  });

  it.each(['staging', '', null, true, 1, {}, ['development']])(
    'rejects unsupported NODE_ENV case %#', (value) => {
      expect(() => validateAuthConfig({ NODE_ENV: value })).toThrow('NODE_ENV');
    },
  );

  it('ignores unrelated process configuration without reading its values', () => {
    const input = { NODE_ENV: 'test', PORT: 3000 };
    Object.defineProperty(input, 'DATABASE_URL', {
      enumerable: true,
      get: () => { throw new Error('Unrelated value accessed'); },
    });
    expect(validateAuthConfig(input)).toEqual(defaults);
  });

  it('rejects unknown AUTH flags with a constant redacted message', () => {
    expect(errorMessage({ AUTH_SYNTHETIC_PRIVATE_MARKER: 'synthetic-private-value' }))
      .toBe('Unknown authentication setting');
    expect(errorMessage({ AUTH_OTHER_FLAG: false })).toBe('Unknown authentication setting');
  });

  it.each([undefined, '', ' ', null])('requires explicit production origins case %#', (value) => {
    expect(() => validateAuthConfig({ NODE_ENV: 'production', AUTH_ALLOWED_ORIGINS: value }))
      .toThrow('AUTH_ALLOWED_ORIGINS');
  });

  it('canonicalizes configured origins and deduplicates in insertion order', () => {
    const config = validateAuthConfig({
      AUTH_ALLOWED_ORIGINS: ' https://EXAMPLE.invalid:443/,https://example.invalid,http://[::1]:4200/ ',
    });
    expect(config.allowedOrigins).toEqual(['https://example.invalid', 'http://[::1]:4200']);
    expect(config.cookieSecure).toBe(true);
  });

  it.each(['localhost', '127.0.0.1', '[::1]'])('allows HTTP loopback %s only outside production', (host) => {
    const input = { AUTH_ALLOWED_ORIGINS: `http://${host}:4200` };
    expect(validateAuthConfig(input).cookieSecure).toBe(false);
    expect(validateAuthConfig({ ...input, NODE_ENV: 'test' }).cookieSecure).toBe(false);
    expect(() => validateAuthConfig({ ...input, NODE_ENV: 'production' })).toThrow('AUTH_ALLOWED_ORIGINS');
  });

  it.each([
    'http://example.invalid', 'http://localhost.example.invalid', 'https://*.example.invalid',
    '*', 'null', 'ftp://example.invalid', 'https://user@example.invalid',
    'https://@example.invalid', 'https://example.invalid/path', 'https://example.invalid/../',
    'https://example.invalid?', 'https://example.invalid?x=1', 'https://example.invalid#',
    'https://example.invalid#part', 'https://example.invalid,', ',https://example.invalid',
    'https://example.invalid,,https://other.invalid', 'https://example.invalid\\',
    'https://', 'https://example.invalid:bad', 'https://exam\tple.invalid',
    '', ' ', null, 42, false, [], {},
  ])('rejects invalid origin case %# without reflecting it', (value) => {
    expect(() => validateAuthConfig({ AUTH_ALLOWED_ORIGINS: value })).toThrow('AUTH_ALLOWED_ORIGINS');
  });

  describe.each(['development', 'production'])('canonical wildcard rejection in %s', (nodeEnv) => {
    it.each(['https://%2A.example.test', 'https://%2a.example.test', 'https://＊.example.test'])(
      'rejects encoded or IDNA wildcard case %# with only the public rule', (origin) => {
        expect(new URL(origin).hostname).toBe('*.example.test');
        expect(errorMessage({ NODE_ENV: nodeEnv, AUTH_ALLOWED_ORIGINS: origin })).toBe(
          'AUTH_ALLOWED_ORIGINS must contain 1 to 16 distinct HTTPS origins or dev/test HTTP loopback origins without userinfo, paths, queries, fragments, or wildcards',
        );
      },
    );
  });

  it('bounds distinct origins, not repeated entries', () => {
    const origins = Array.from({ length: 16 }, (_, i) => `https://host${i}.invalid`);
    expect(validateAuthConfig({ AUTH_ALLOWED_ORIGINS: [...origins, origins[0]].join(',') })
      .allowedOrigins).toHaveLength(16);
    expect(() => validateAuthConfig({ AUTH_ALLOWED_ORIGINS: [...origins, 'https://extra.invalid'].join(',') }))
      .toThrow('AUTH_ALLOWED_ORIGINS');
  });

  it.each([true, 'true'])('permits explicit Secure on local HTTP case %#', (value) => {
    expect(validateAuthConfig({ AUTH_COOKIE_SECURE: value }).cookieSecure).toBe(true);
  });

  it.each([false, 'false'])('permits insecure cookies only with dev/test HTTP loopback case %#', (value) => {
    expect(validateAuthConfig({ NODE_ENV: 'test', AUTH_COOKIE_SECURE: value }).cookieSecure).toBe(false);
    expect(() => validateAuthConfig({ AUTH_ALLOWED_ORIGINS: 'https://example.invalid', AUTH_COOKIE_SECURE: value }))
      .toThrow('AUTH_COOKIE_SECURE');
    expect(() => validateAuthConfig({ NODE_ENV: 'production', AUTH_ALLOWED_ORIGINS: 'https://example.invalid', AUTH_COOKIE_SECURE: value }))
      .toThrow('AUTH_COOKIE_SECURE');
  });

  it('defaults production HTTPS to Secure and rejects false for mixed schemes', () => {
    expect(validateAuthConfig({ NODE_ENV: 'production', AUTH_ALLOWED_ORIGINS: 'https://example.invalid' }).cookieSecure).toBe(true);
    expect(() => validateAuthConfig({
      AUTH_ALLOWED_ORIGINS: 'http://localhost:4200,https://example.invalid', AUTH_COOKIE_SECURE: false,
    })).toThrow('AUTH_COOKIE_SECURE');
  });

  it.each(['TRUE', 'False', ' true', '', 0, 1, null, {}, []])('rejects non-strict boolean case %#', (value) => {
    expect(() => validateAuthConfig({ AUTH_COOKIE_SECURE: value })).toThrow('AUTH_COOKIE_SECURE');
  });

  describe.each(numericSettings)('%s', (setting, field, min, max) => {
    const baseline = { AUTH_SESSION_ABSOLUTE_SECONDS: 86400, AUTH_SESSION_IDLE_SECONDS: 30 };

    it.each(['minimum', 'maximum'])('accepts inclusive %s as number and decimal string', (boundary) => {
      const value = boundary === 'minimum' ? min : max;
      for (const input of [value, String(value)]) {
        expect(validateAuthConfig({ ...baseline, [setting]: input })[field]).toBe(value);
      }
    });

    it('rejects both out-of-range boundaries', () => {
      for (const value of [min - 1, max + 1]) {
        expect(() => validateAuthConfig({ ...baseline, [setting]: value })).toThrow(setting);
      }
    });

    it.each(['', ' ', '1.0', '1e2', ' 1', '1 ', '-0', '-1', '+1', 'Infinity',
      '9007199254740992', 1.5, -1, -0, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, true, null, {}, []])(
      'rejects non-unsigned-safe-integer case %#', (value) => {
        expect(() => validateAuthConfig({ ...baseline, [setting]: value })).toThrow(setting);
      },
    );
  });

  it('accepts decimal leading zeros and a no-wait queue', () => {
    expect(validateAuthConfig({ AUTH_LOGIN_IP_LIMIT: '0010', AUTH_ARGON2_QUEUE_LIMIT: '0' }))
      .toEqual({ ...defaults, argon2QueueLimit: 0 });
  });

  it('enforces idle <= absolute and permits equality', () => {
    expect(() => validateAuthConfig({ AUTH_SESSION_ABSOLUTE_SECONDS: 60, AUTH_SESSION_IDLE_SECONDS: 61 }))
      .toThrow('AUTH_SESSION_IDLE_SECONDS must not exceed AUTH_SESSION_ABSOLUTE_SECONDS');
    expect(validateAuthConfig({ AUTH_SESSION_ABSOLUTE_SECONDS: 60, AUTH_SESSION_IDLE_SECONDS: 60 })
      .sessionIdleSeconds).toBe(60);
  });

  it.each(['NODE_ENV', 'AUTH_ALLOWED_ORIGINS', 'AUTH_COOKIE_SECURE', 'AUTH_LOGIN_IP_LIMIT'])(
    'never includes raw supplied values in %s errors', (setting) => {
      const marker = 'synthetic-private-value';
      const message = errorMessage({ [setting]: marker });
      expect(message).toContain(setting);
      expect(message).not.toContain(marker);
      expect(message).not.toContain(JSON.stringify({ [setting]: marker }));
    },
  );

  it('freezes the result and origins without mutating or retaining the input', () => {
    const input = { AUTH_ALLOWED_ORIGINS: 'https://EXAMPLE.invalid/', AUTH_LOGIN_IP_LIMIT: '12' };
    const snapshot = { ...input };
    const config = validateAuthConfig(Object.freeze(input));
    expect(input).toEqual(snapshot);
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.allowedOrigins)).toBe(true);
    expect(() => (config.allowedOrigins as string[]).push('https://other.invalid')).toThrow(TypeError);
    expect(() => { (config as { cookieSecure: boolean }).cookieSecure = false; }).toThrow(TypeError);
    expect(validateAuthConfig({}).allowedOrigins).not.toBe(validateAuthConfig({}).allowedOrigins);
  });

  it('does not read global configuration during import or validation', () => {
    const descriptor = Object.getOwnPropertyDescriptor(process, 'env');
    try {
      Object.defineProperty(process, 'env', {
        configurable: true,
        get: () => { throw new Error('Global configuration accessed'); },
      });
      jest.isolateModules(() => {
        const isolated = jest.requireActual<typeof import('./auth.config')>('./auth.config');
        expect(isolated.validateAuthConfig({})).toEqual(defaults);
      });
    } finally {
      if (descriptor) Object.defineProperty(process, 'env', descriptor);
    }
  });
});
