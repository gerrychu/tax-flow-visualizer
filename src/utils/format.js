export function formatCurrency(value, compact = false) {
  if (value === null || value === undefined || value === '') return '$0';
  const v = parseFloat(value) || 0;
  if (compact && Math.abs(v) >= 1000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(v);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

export function parseCurrencyInput(str) {
  return str.replace(/[$,\s]/g, '');
}

export function formatCurrencyInput(str) {
  const raw = parseCurrencyInput(str);
  if (!raw) return '';
  const num = parseFloat(raw);
  if (isNaN(num)) return raw;
  return new Intl.NumberFormat('en-US').format(num);
}
