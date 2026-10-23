import { InjectionToken } from '@angular/core';

export const H7_TIME_ZONE = 'America/Argentina/Buenos_Aires';
export const H7_CLOCK = new InjectionToken<() => Date>('H7_REPORTS_CLOCK', {
  providedIn: 'root', factory: () => () => new Date(),
});

export function currentBuenosAiresMonth(now: Date): Readonly<{ from: string; to: string }> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: H7_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const year = values['year'];
  const month = values['month'];
  if (!year || !month) throw new RangeError('Unable to determine the Buenos Aires calendar month.');
  const nextMonth = Number(month) === 12 ? '01' : String(Number(month) + 1).padStart(2, '0');
  const nextYear = Number(month) === 12 ? String(Number(year) + 1) : year;
  return { from: `${year}-${month}-01`, to: `${nextYear}-${nextMonth}-01` };
}
