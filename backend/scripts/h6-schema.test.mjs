import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const schema = () => readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
test('H6 adds durable notification lifecycle and contact without duplicating checkout authority', () => {
  const text = schema();
  for (const field of ['attemptCount', 'totalAttemptCount', 'lastAttemptAt', 'nextAttemptAt', 'sentAt', 'lastError', 'leaseToken', 'leaseUntil']) assert.ok(new RegExp(`\\b${field}\\b`).test(text), field);
  assert.match(text, /ORDER_CANCELLED_ADMIN/);
  assert.match(text, /model CheckoutPolicy[\s\S]*?contact\s+Json/);
  assert.equal((text.match(/\bfeeMinor\s+BigInt/g) ?? []).length, 1);
});
test('H6 additive migration constrains lease lifecycle, attempts and safe error categories', () => {
  const sql = readFileSync(new URL('../prisma/migrations/20261022000000_h6_notifications_settings/migration.sql', import.meta.url), 'utf8');
  for (const value of ['ORDER_CANCELLED_ADMIN', 'PROCESSING', 'RETRY_WAIT', 'SENT', 'FAILED', 'NotificationJob_attempts_check', 'NotificationJob_lease_check', 'NotificationJob_error_check']) assert.ok(sql.includes(value), value);
  assert.doesNotMatch(sql, /\b(?:DELETE|TRUNCATE|DROP TABLE)\b/i);
});
