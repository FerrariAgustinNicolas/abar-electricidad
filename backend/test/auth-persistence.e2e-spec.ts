// These scenarios are source-prepared only. They stay disabled regardless of
// DATABASE_URL until a separately authorized, uniquely owned PostgreSQL fixture
// and its explicit test integration are supplied. No client or connection is
// constructed here, so importing this module cannot contact a database.
describe.skip('AdminUser PostgreSQL persistence (authorization pending)', () => {
  it.todo('creates an administrator and retrieves its persisted identity and private hash');
  it.todo('rejects a duplicate email after trim/lowercase normalization');
  it.todo('round-trips active, mustChangePassword, and version values');
});
