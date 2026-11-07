export const MIN_FEE_AMOUNT = 1;
export const MAX_FEE_AMOUNT = 5000;
export const MAX_CONCEPT_LENGTH = 60;
export const DEFAULT_HISTORY_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 50;

export const FEE_MESSAGES = {
  periodFormat: 'El periodo debe tener el formato AAAA-MM.',
  periodWindow: 'El periodo debe estar entre el mes actual y 3 meses adelante.',
  amount: 'El monto debe estar entre $1.00 y $5,000.00.',
  dueDateFormat: 'Ingresa una fecha de vencimiento válida (AAAA-MM-DD).',
  dueDate:
    'La fecha de vencimiento debe estar dentro del periodo y no puede ser anterior a hoy.',
  concept: 'El concepto no puede superar los 60 caracteres.',
  page: 'La página debe ser un número entero mayor o igual a 1.',
  pageSize: 'El tamaño de página debe estar entre 1 y 50.',
  noActiveUnits: 'No hay unidades activas para generar cuotas.',
} as const;

export function periodAlreadyGeneratedMessage(label: string): string {
  return `Las cuotas del periodo ${label} ya fueron generadas para todas las unidades.`;
}
