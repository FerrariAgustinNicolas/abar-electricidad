import { currentBuenosAiresMonth } from './h7-period';

describe('currentBuenosAiresMonth', () => {
  it('uses the IANA Buenos Aires calendar month, independent of the browser timezone', () => {
    expect(currentBuenosAiresMonth(new Date('2026-11-01T02:30:00.000Z')))
      .toEqual({ from: '2026-10-01', to: '2026-11-01' });
  });

  it('uses a half-open month range even at a local month boundary', () => {
    expect(currentBuenosAiresMonth(new Date('2026-10-01T03:00:00.000Z')))
      .toEqual({ from: '2026-10-01', to: '2026-11-01' });
  });
});
