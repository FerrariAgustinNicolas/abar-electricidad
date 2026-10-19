export type AuthConfig = Readonly<{
  allowedOrigins: readonly string[];
  cookieSecure: boolean;
  sessionAbsoluteSeconds: number;
  sessionIdleSeconds: number;
  preAuthSeconds: number;
  loginIpLimit: number;
  loginIpWindowSeconds: number;
  loginAccountLimit: number;
  loginAccountWindowSeconds: number;
  csrfIpLimit: number;
  csrfIpWindowSeconds: number;
  argon2Concurrency: number;
  argon2QueueLimit: number;
}>;

const numericSettings = {
  sessionAbsoluteSeconds: ['AUTH_SESSION_ABSOLUTE_SECONDS', 28800, 60, 86400],
  sessionIdleSeconds: ['AUTH_SESSION_IDLE_SECONDS', 1800, 30, 14400],
  preAuthSeconds: ['AUTH_PREAUTH_SECONDS', 900, 30, 1800],
  loginIpLimit: ['AUTH_LOGIN_IP_LIMIT', 10, 1, 1000],
  loginIpWindowSeconds: ['AUTH_LOGIN_IP_WINDOW_SECONDS', 60, 1, 3600],
  loginAccountLimit: ['AUTH_LOGIN_ACCOUNT_LIMIT', 10, 1, 1000],
  loginAccountWindowSeconds: ['AUTH_LOGIN_ACCOUNT_WINDOW_SECONDS', 900, 1, 3600],
  csrfIpLimit: ['AUTH_CSRF_IP_LIMIT', 30, 1, 1000],
  csrfIpWindowSeconds: ['AUTH_CSRF_IP_WINDOW_SECONDS', 60, 1, 3600],
  argon2Concurrency: ['AUTH_ARGON2_CONCURRENCY', 1, 1, 4],
  argon2QueueLimit: ['AUTH_ARGON2_QUEUE_LIMIT', 16, 0, 64],
} as const;

type NumericField = keyof typeof numericSettings;
const knownSettings = new Set<string>([
  'AUTH_ALLOWED_ORIGINS', 'AUTH_COOKIE_SECURE', 'AUTH_CSRF_ENCRYPTION_KEY',
  ...Object.values(numericSettings).map(([name]) => name),
]);
const localOrigins = ['http://127.0.0.1:4200', 'http://localhost:4200'];
const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
const originRule = 'AUTH_ALLOWED_ORIGINS must contain 1 to 16 distinct HTTPS origins or dev/test HTTP loopback origins without userinfo, paths, queries, fragments, or wildcards';

function parseOrigins(value: unknown, production: boolean): string[] {
  if (value === undefined && !production) return [...localOrigins];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(originRule);

  const origins = new Set<string>();
  for (const entry of value.split(',')) {
    const text = entry.trim();
    // Validate syntax before URL normalization can erase paths or empty query/fragment markers.
    if (!/^https?:\/\/[^/?#\\\s]+\/?$/i.test(text) || /[*@]/.test(text)) {
      throw new Error(originRule);
    }
    let parsed: URL;
    try {
      parsed = new URL(text);
    } catch {
      // URL errors may echo input; expose only the public validation rule.
      throw new Error(originRule);
    }
    // Host decoding and IDNA can introduce wildcards absent from the raw configuration.
    if (parsed.hostname.includes('*') || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash ||
        (parsed.protocol !== 'https:' &&
          (parsed.protocol !== 'http:' || production || !loopbackHosts.has(parsed.hostname)))) {
      throw new Error(originRule);
    }
    origins.add(parsed.origin);
    if (origins.size > 16) throw new Error(originRule);
  }
  return [...origins];
}

function parseSecure(value: unknown, required: boolean): boolean {
  if (value === undefined) return required;
  if (value !== true && value !== false && value !== 'true' && value !== 'false') {
    throw new Error('AUTH_COOKIE_SECURE must be a boolean or lowercase true/false');
  }
  const secure = value === true || value === 'true';
  if (!secure && required) {
    throw new Error('AUTH_COOKIE_SECURE must be true in production or with any HTTPS origin');
  }
  return secure;
}

function parseInteger(value: unknown, setting: string, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  const rule = `${setting} must be an unsigned safe integer between ${min} and ${max}`;
  let result: number;
  if (typeof value === 'number') {
    result = value;
  } else if (typeof value === 'string' && /^[0-9]+$/.test(value)) {
    result = Number(value);
  } else {
    throw new Error(rule);
  }
  if (!Number.isSafeInteger(result) || Object.is(result, -0) || result < min || result > max) {
    throw new Error(rule);
  }
  return result;
}

/** Standalone parser: no environment access, module registration, or runtime auth effects. */
export function validateAuthConfig(input: Record<string, unknown>): AuthConfig {
  for (const key of Object.keys(input)) {
    if (key.startsWith('AUTH_') && !knownSettings.has(key)) {
      throw new Error('Unknown authentication setting');
    }
  }
  const nodeEnv = input.NODE_ENV === undefined ? 'development' : input.NODE_ENV;
  if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
    throw new Error('NODE_ENV must be development, test, or production');
  }
  const production = nodeEnv === 'production';
  const allowedOrigins = parseOrigins(input.AUTH_ALLOWED_ORIGINS, production);
  const cookieSecure = parseSecure(input.AUTH_COOKIE_SECURE,
    production || allowedOrigins.some((origin) => origin.startsWith('https:')));
  const numeric = {} as Record<NumericField, number>;
  for (const field of Object.keys(numericSettings) as NumericField[]) {
    const [setting, fallback, min, max] = numericSettings[field];
    numeric[field] = parseInteger(input[setting], setting, fallback, min, max);
  }
  if (numeric.sessionIdleSeconds > numeric.sessionAbsoluteSeconds) {
    throw new Error('AUTH_SESSION_IDLE_SECONDS must not exceed AUTH_SESSION_ABSOLUTE_SECONDS');
  }
  return Object.freeze({ ...numeric, cookieSecure, allowedOrigins: Object.freeze(allowedOrigins) });
}
