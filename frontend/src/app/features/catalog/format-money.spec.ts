import { describe, expect, it } from 'vitest';
import { formatMoney } from './format-money';

describe('formatMoney', () => {
  it('preserves minor units beyond JavaScript safe integer precision', () => {
    const rendered = formatMoney('9007199254740993');
    expect(rendered).toContain('90.071.992.547.409');
    expect(rendered.endsWith(',93')).toBe(true);
  });

  it('rejects malformed values without coercing them into a price', () => {
    expect(formatMoney('1.5')).toBe('Precio no disponible');
  });
});
