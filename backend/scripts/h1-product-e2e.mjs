import { isDeepStrictEqual } from 'node:util';

const PRODUCT_CHECKS = Object.freeze([
  'auth.csrf', 'auth.login', 'auth.me', 'auth.logout', 'auth.change-password',
  'admin.list', 'admin.create', 'admin.patch', 'admin.reset-password',
]);
const denied = () => { throw new Error('H1 product E2E check failed'); };

function cookiePair(headers, name) {
  const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie') ?? ''];
  const value = values.find(item => item.startsWith(`${name}=`));
  return value?.split(';', 1)[0] ?? '';
}

async function request(baseUrl, path, { method = 'GET', cookie = '', csrf = '', origin, body, deadlineAt }) {
  if (Date.now() >= deadlineAt) denied();
  const headers = { origin };
  if (cookie) headers.cookie = cookie;
  if (csrf) headers['x-csrf-token'] = csrf;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(new URL(path, baseUrl), {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual',
    signal: AbortSignal.timeout(Math.max(1, deadlineAt - Date.now())),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : undefined; } catch { denied(); }
  return { status: response.status, noStore: response.headers.get('cache-control') === 'no-store',
    bodyEmpty: text === '', data, headers: response.headers,
    sessionCookie: cookiePair(response.headers, 'abar_admin_session'),
    preauthCookie: cookiePair(response.headers, 'abar_auth_context') };
}

function emitStage(onStage, stage, phase, errorClass) {
  try {
    if (errorClass === undefined) onStage(stage, phase);
    else onStage(stage, phase, errorClass);
  } catch { /* Diagnostics must not change fixture behavior. */ }
}
async function observeStage(onStage, stage, operation) {
  emitStage(onStage, stage, 'start');
  try {
    const result = await operation();
    emitStage(onStage, stage, 'end');
    return result;
  } catch (error) {
    emitStage(onStage, stage, 'error', 'RUNTIME_ERROR');
    throw error;
  }
}

async function freshCsrf(baseUrl, origin, deadlineAt, onStage) {
  const response = await observeStage(onStage, 'check.auth.csrf', () => request(baseUrl, '/api/v1/auth/csrf', { origin, deadlineAt }));
  if (response.status !== 200 || !response.noStore || !/^[A-Za-z0-9_-]{43}$/.test(response.data?.csrfToken ?? '') || !response.preauthCookie) denied();
  return { token: response.data.csrfToken, cookie: response.preauthCookie };
}

function check(name, condition) { if (!condition) denied(); return { name, passed: true }; }

// This runner intentionally talks to the real listener and accepts only a caller-owned,
// run-scoped observer snapshot function. It never serializes snapshots or credentials.
export async function runAdminProductE2E({ baseUrl, origin, runId, actorId, actorCookie, actorCsrf,
  currentPassword, replacementPassword, deadlineAt, snapshot, onStage = () => {} }) {
  const checks = Object.fromEntries(PRODUCT_CHECKS.map(name => [name, false]));
  let failureStage = 'check.auth.me';
  try {
    if (typeof baseUrl !== 'string' || typeof origin !== 'string' || !/^[0-9a-f]{32}$/.test(runId) ||
        typeof actorId !== 'string' || typeof actorCookie !== 'string' || typeof actorCsrf !== 'string' ||
        typeof currentPassword !== 'string' || typeof replacementPassword !== 'string' ||
        typeof snapshot !== 'function' || !Number.isSafeInteger(deadlineAt)) denied();

    const actorMe = await observeStage(onStage, 'check.auth.me', () => request(baseUrl, '/api/v1/auth/me', { cookie: actorCookie, origin, deadlineAt }));
    if (actorMe.status !== 200 || !actorMe.noStore || actorMe.data?.admin?.id !== actorId) denied();
    const actorSession = { cookie: actorCookie, csrf: actorCsrf };
    emitStage(onStage, 'admin_checks', 'start');
    failureStage = 'check.admin.create';
    const beforeRejected = await snapshot();
    const badOrigin = await request(baseUrl, '/api/v1/admin/users', { method: 'POST', cookie: actorCookie,
      csrf: actorCsrf, origin: 'http://invalid.example', body: { name: 'Denied', email: 'denied@example.invalid', temporaryPassword: replacementPassword }, deadlineAt });
    const badCsrf = await request(baseUrl, '/api/v1/admin/users', { method: 'POST', cookie: actorCookie,
      csrf: 'A'.repeat(43), origin, body: { name: 'Denied', email: 'denied@example.invalid', temporaryPassword: replacementPassword }, deadlineAt });
    const afterRejected = await snapshot();
    if (badOrigin.status !== 403 || badCsrf.status !== 403 || !badOrigin.noStore || !badCsrf.noStore ||
        !isDeepStrictEqual(beforeRejected, afterRejected)) denied();

    failureStage = 'check.admin.list';
    const list = await observeStage(onStage, 'check.admin.list', () => request(baseUrl, '/api/v1/admin/users?page=1&pageSize=100&sort=email', { cookie: actorCookie, origin, deadlineAt }));
    checks['admin.list'] = check('admin.list', list.status === 200 && list.noStore && Array.isArray(list.data?.items) && list.data?.pageInfo?.page === 1).passed;

    const createUser = async (suffix, name) => request(baseUrl, '/api/v1/admin/users', { method: 'POST', cookie: actorCookie,
      csrf: actorCsrf, origin, body: { name, email: `h1-${runId}-${suffix}@example.invalid`, temporaryPassword: replacementPassword }, deadlineAt });
    failureStage = 'check.admin.create';
    const [createdA, createdB] = await observeStage(onStage, 'check.admin.create', async () => [
      await createUser('a', 'H1 Fixture Target A'), await createUser('b', 'H1 Fixture Target B'),
    ]);
    if (createdA.status !== 201 || createdB.status !== 201 || !createdA.noStore || !createdB.noStore ||
        createdA.data?.version !== 1 || createdB.data?.version !== 1 || createdA.data?.active !== true ||
        createdA.data?.mustChangePassword !== true || 'passwordHash' in (createdA.data ?? {})) denied();
    checks['admin.create'] = check('admin.create', true).passed;

    const duplicate = await request(baseUrl, '/api/v1/admin/users', { method: 'POST', cookie: actorCookie, csrf: actorCsrf, origin,
      body: { name: 'Duplicate', email: `H1-${runId}-A@EXAMPLE.INVALID`, temporaryPassword: replacementPassword }, deadlineAt });
    if (duplicate.status !== 409 || !duplicate.noStore) denied();

    failureStage = 'check.admin.patch';
    const [patched, stale] = await observeStage(onStage, 'check.admin.patch', async () => [
      await request(baseUrl, `/api/v1/admin/users/${encodeURIComponent(createdA.data.id)}`, { method: 'PATCH', cookie: actorCookie,
        csrf: actorCsrf, origin, body: { name: 'H1 Fixture Renamed', expectedVersion: 1 }, deadlineAt }),
      await request(baseUrl, `/api/v1/admin/users/${encodeURIComponent(createdA.data.id)}`, { method: 'PATCH', cookie: actorCookie,
        csrf: actorCsrf, origin, body: { name: 'Stale Write', expectedVersion: 1 }, deadlineAt }),
    ]);
    if (patched.status !== 200 || patched.data?.version !== 2 || !patched.noStore || stale.status !== 409 ||
        stale.data?.code !== 'VERSION_CONFLICT' || !stale.noStore) denied();
    checks['admin.patch'] = check('admin.patch', true).passed;

    failureStage = 'check.auth.csrf';
    const targetCsrf = await freshCsrf(baseUrl, origin, deadlineAt, onStage);
    failureStage = 'check.auth.login';
    const targetLogin = await observeStage(onStage, 'check.auth.login', () => request(baseUrl, '/api/v1/auth/login', { method: 'POST', cookie: targetCsrf.cookie, csrf: targetCsrf.token,
      origin, body: { email: `h1-${runId}-a@example.invalid`, password: replacementPassword }, deadlineAt }));
    if (targetLogin.status !== 200 || !targetLogin.noStore || !targetLogin.sessionCookie ||
        targetLogin.data?.admin?.mustChangePassword !== true) denied();
    failureStage = 'check.auth.me';
    const restrictedList = await request(baseUrl, '/api/v1/admin/users', { cookie: targetLogin.sessionCookie, origin, deadlineAt });
    const targetMe = await request(baseUrl, '/api/v1/auth/me', { cookie: targetLogin.sessionCookie, origin, deadlineAt });
    if (restrictedList.status !== 403 || restrictedList.data?.code !== 'PASSWORD_CHANGE_REQUIRED' ||
        targetMe.status !== 200 || !targetMe.noStore) denied();

    failureStage = 'check.admin.reset-password';
    const beforeReset = await snapshot();
    const reset = await observeStage(onStage, 'check.admin.reset-password', () => request(baseUrl, `/api/v1/admin/users/${encodeURIComponent(createdA.data.id)}/reset-password`, {
      method: 'POST', cookie: actorSession.cookie, csrf: actorSession.csrf, origin,
      body: { temporaryPassword: currentPassword, reason: 'H1 real fixture reset' }, deadlineAt,
    }));
    const afterReset = await snapshot();
    const targetSessionsBefore = beforeReset.sessions.filter(row => row.adminUserId === createdA.data.id);
    const targetSessionsAfter = afterReset.sessions.filter(row => row.adminUserId === createdA.data.id);
    const auditDelta = afterReset.audits.filter(row => row.targetAdminUserId === createdA.data.id && row.reason === 'H1 real fixture reset');
    const resetUser = afterReset.users.find(row => row.id === createdA.data.id);
    const revoked = targetSessionsBefore.length > 0 && targetSessionsBefore.every(row => {
      const next = targetSessionsAfter.find(candidate => candidate.id === row.id);
      return next !== undefined && next.revokedAt !== null;
    });
    if (reset.status !== 204 || !reset.noStore || !reset.bodyEmpty || !revoked || auditDelta.length !== 1 ||
        auditDelta[0].actorAdminUserId !== actorId || resetUser?.mustChangePassword !== true || resetUser.version !== 3 ||
        JSON.stringify(auditDelta).includes(currentPassword) || JSON.stringify(auditDelta).includes(replacementPassword)) denied();
    const revokedMe = await request(baseUrl, '/api/v1/auth/me', { cookie: targetLogin.sessionCookie, origin, deadlineAt });
    if (revokedMe.status !== 401 || !revokedMe.noStore) denied();
    checks['admin.reset-password'] = check('admin.reset-password', true).passed;

    failureStage = 'check.auth.csrf';
    const resetCsrf = await freshCsrf(baseUrl, origin, deadlineAt, onStage);
    failureStage = 'check.auth.login';
    const resetLogin = await request(baseUrl, '/api/v1/auth/login', { method: 'POST', cookie: resetCsrf.cookie, csrf: resetCsrf.token,
      origin, body: { email: `h1-${runId}-a@example.invalid`, password: currentPassword }, deadlineAt });
    failureStage = 'check.auth.change-password';
    const changed = await request(baseUrl, '/api/v1/auth/change-password', { method: 'POST', cookie: resetLogin.sessionCookie,
      csrf: resetLogin.headers.get('x-csrf-token') ?? '', origin,
      body: { currentPassword, newPassword: replacementPassword }, deadlineAt });
    const targetActorCookie = changed.sessionCookie;
    const targetActorCsrf = changed.headers.get('x-csrf-token') ?? '';
    if (resetLogin.status !== 200 || resetLogin.data?.admin?.mustChangePassword !== true || changed.status !== 204 ||
        !changed.noStore || !changed.bodyEmpty || !targetActorCookie || !targetActorCsrf) denied();

    failureStage = 'check.admin.patch';
    const disableB = await request(baseUrl, `/api/v1/admin/users/${encodeURIComponent(createdB.data.id)}`, { method: 'PATCH',
      cookie: actorCookie, csrf: actorCsrf, origin, body: { active: false, expectedVersion: 1 }, deadlineAt });
    if (disableB.status !== 200 || disableB.data?.active !== false) denied();

    failureStage = 'check.admin.patch';
    // Each actor deactivates itself: cross-targeting revokes the competing actor
    // before its authorization check, legitimately producing 401 rather than LAST_ACTIVE_ADMIN.
    const races = await Promise.all([
      request(baseUrl, `/api/v1/admin/users/${encodeURIComponent(actorId)}`, { method: 'PATCH',
        cookie: actorCookie, csrf: actorCsrf, origin, body: { active: false, expectedVersion: 2 }, deadlineAt }),
      request(baseUrl, `/api/v1/admin/users/${encodeURIComponent(createdA.data.id)}`, { method: 'PATCH',
        cookie: targetActorCookie, csrf: targetActorCsrf, origin, body: { active: false, expectedVersion: 4 }, deadlineAt }),
    ]);
    const accepted = races.filter(value => value.status === 200).length;
    const lastActive = races.filter(value => value.status === 409 && value.data?.code === 'LAST_ACTIVE_ADMIN').length;
    const final = await snapshot();
    const activeCount = final.users.filter(user => user.active).length;
    if (accepted !== 1 || lastActive !== 1 || activeCount !== 1) denied();
    const survivor = races[0].status === 409 ? { cookie: actorCookie, csrf: actorCsrf } : { cookie: targetActorCookie, csrf: targetActorCsrf };

    failureStage = 'check.auth.logout';
    const logout = await observeStage(onStage, 'check.auth.logout', () => request(baseUrl, '/api/v1/auth/logout', { method: 'POST', cookie: survivor.cookie, csrf: survivor.csrf, origin, deadlineAt }));
    const afterLogout = await request(baseUrl, '/api/v1/auth/me', { cookie: survivor.cookie, origin, deadlineAt });
    if (logout.status !== 204 || !logout.noStore || !logout.bodyEmpty || afterLogout.status !== 401 || !afterLogout.noStore) denied();

    checks['auth.csrf'] = true;
    checks['auth.login'] = true;
    checks['auth.me'] = true;
    checks['auth.logout'] = true;
    checks['auth.change-password'] = true; // Existing 15-check fixture proves the full password-rotation transaction.
    emitStage(onStage, 'admin_checks', 'end');
    return Object.freeze({ checks: Object.freeze(PRODUCT_CHECKS.map(name => Object.freeze({ name, passed: checks[name] }))),
      passed: PRODUCT_CHECKS.every(name => checks[name]) });
  } catch {
    emitStage(onStage, failureStage, 'error', 'RUNTIME_ERROR');
    return Object.freeze({ checks: Object.freeze(PRODUCT_CHECKS.map(name => Object.freeze({ name, passed: checks[name] }))), passed: false });
  }
}

export { PRODUCT_CHECKS };
