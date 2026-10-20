import { createHash } from 'node:crypto';

export type PasswordPolicyErrorKind = 'invalid' | 'blocked' | 'unavailable';

const messages: Record<PasswordPolicyErrorKind, string> = {
  invalid: 'Invalid password input or length',
  blocked: 'Password is not permitted',
  unavailable: 'Password policy is unavailable',
};

export class PasswordPolicyError extends Error {
  constructor(public readonly kind: PasswordPolicyErrorKind) {
    super(messages[kind]);
    this.name = 'PasswordPolicyError';
  }
}

export interface PasswordBlocklistLookup {
  hasDigest(digest: string): boolean;
}

function normalizeScalarString(input: unknown): string {
  if (typeof input !== 'string') throw new PasswordPolicyError('invalid');
  // Iteration combines valid pairs; lone UTF16 surrogates remain in this range.
  for (const character of input) {
    const scalar = character.codePointAt(0)!;
    if (scalar >= 0xd800 && scalar <= 0xdfff) {
      throw new PasswordPolicyError('invalid');
    }
  }
  return input.normalize('NFC');
}

function enforceLength(normalized: string, minimum: number): string {
  const length = [...normalized].length;
  if (length < minimum || length > 128) throw new PasswordPolicyError('invalid');
  return normalized;
}

// Private credential bytes: never lowercase, trim or prehash before Argon.
export function normalizeCredentialPassword(input: unknown): string {
  return enforceLength(normalizeScalarString(input), 1);
}

// Public denylist index only; key length is independent of credential bounds.
export function deriveBlocklistDigest(input: unknown): string {
  return createHash('sha256')
    .update(normalizeScalarString(input).toLowerCase(), 'utf8')
    .digest('hex');
}

export function validateNewPassword(
  input: unknown,
  lookup: PasswordBlocklistLookup,
): string {
  const normalized = enforceLength(normalizeScalarString(input), 15);
  const digest = deriveBlocklistDigest(normalized);
  let blocked: unknown;
  try {
    const hasDigest = lookup.hasDigest;
    blocked = hasDigest.call(lookup, digest);
  } catch {
    // Discard all resource errors, including getter failures and their causes.
    throw new PasswordPolicyError('unavailable');
  }
  if (typeof blocked !== 'boolean') throw new PasswordPolicyError('unavailable');
  // Deliberate policy rejection must not be caught as dependency failure.
  if (blocked) throw new PasswordPolicyError('blocked');
  return normalized;
}
