const MONTHS_AHEAD = 3;

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

function parsePeriod(period: string): { year: number; month: number } {
  const [year, month] = period.split('-').map(Number);
  return { year, month };
}

export function currentPeriod(today: string): string {
  return today.slice(0, 7);
}

export function addMonths(period: string, months: number): string {
  const { year, month } = parsePeriod(period);
  const monthIndex = year * 12 + month - 1 + months;
  const nextYear = Math.floor(monthIndex / 12);
  const nextMonth = (monthIndex % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

export function allowedPeriods(today: string): string[] {
  const first = currentPeriod(today);
  return Array.from({ length: MONTHS_AHEAD + 1 }, (_, offset) =>
    addMonths(first, offset),
  );
}

export function isAllowedPeriod(period: string, today: string): boolean {
  return allowedPeriods(today).includes(period);
}

export function isValidDueDate(
  dueDate: string,
  period: string,
  today: string,
): boolean {
  return dueDate.startsWith(`${period}-`) && dueDate >= today;
}

export function periodLabel(period: string): string {
  const { year, month } = parsePeriod(period);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function defaultConcept(period: string): string {
  return `Cuota de mantenimiento ${periodLabel(period)}`;
}
