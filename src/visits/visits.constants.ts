/** Alfabeto del código de visita: sin 0/O, 1/I/L (H14). */
export const VISIT_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const VISIT_CODE_LENGTH = 6;
/** Intentos para generar un código que no choque con otro. */
export const VISIT_CODE_MAX_ATTEMPTS = 5;

/** Una visita se puede autorizar desde hoy hasta hoy + 30 días. */
export const MAX_DAYS_AHEAD = 30;
/** Horario de visitas: el código solo sirve en esta franja del día de la visita. */
export const VISIT_HOURS = { from: '06:00', until: '22:00' } as const;
/** La hora estimada va en pasos de 15 minutos. */
export const TIME_STEP_MINUTES = 15;

export const DUI_REGEX = /^\d{8}-\d$/;
export const PASSPORT_REGEX = /^[A-Za-z0-9]{6,12}$/;
/** Letras (con tildes y ñ) y espacios. */
export const NAME_REGEX = /^[\p{L} ]+$/u;

export const VISIT_MESSAGES = {
  name: 'El nombre debe tener entre 3 y 80 caracteres, solo letras y espacios.',
  documentType: 'Selecciona el tipo de documento: DUI o Pasaporte.',
  dui: 'Ingresa el DUI con el formato 00000000-0.',
  passport: 'El pasaporte debe tener de 6 a 12 letras o números.',
  dateFormat: 'La fecha debe tener el formato AAAA-MM-DD.',
  /** Se completa con la fecha límite: "La fecha debe estar entre hoy y 08/12/2026." */
  dateRange: (limit: string) => `La fecha debe estar entre hoy y ${limit}.`,
  hours: 'El horario de visitas es de 06:00 a 22:00.',
  timeStep: 'La hora debe ir en pasos de 15 minutos.',
  timePassed: 'La hora estimada no puede ser anterior a la hora actual.',
  reason: 'El motivo debe tener entre 5 y 100 caracteres.',
  duplicate: 'Este visitante ya tiene una autorización para esa fecha.',
  noUnit: 'Tu cuenta no tiene una unidad asignada.',
} as const;
