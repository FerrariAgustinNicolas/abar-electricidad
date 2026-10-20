export function formatMoney(amountMinor: string): string {
  if (!/^(0|[1-9][0-9]*)$/.test(amountMinor)) return 'Precio no disponible';
  const minor = BigInt(amountMinor);
  const major = minor / 100n;
  const cents = String(minor % 100n).padStart(2, '0');
  const parts = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).formatToParts(major);
  const prefix = parts.filter((part) => part.type === 'currency' || part.type === 'literal').map((part) => part.value).join('');
  const grouped = parts.filter((part) => part.type !== 'currency' && part.type !== 'literal').map((part) => part.value).join('');
  const decimal = new Intl.NumberFormat('es-AR').formatToParts(1.1).find((part) => part.type === 'decimal')?.value ?? ',';
  return `${prefix}${grouped}${decimal}${cents}`;
}
