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

/** Minutos que tiene el residente para responder una solicitud (H15, H16). */
export const REQUEST_RESPONSE_MINUTES = 15;

/** Nombre de cada estado, para los mensajes 409 de H16. */
export const VISIT_STATUS_LABELS = {
  AUTORIZADA: 'Autorizada',
  PENDIENTE_AUTORIZACION: 'Pendiente de autorización',
  RECHAZADA: 'Rechazada',
  DENTRO: 'Dentro',
  FINALIZADA: 'Finalizada',
  CANCELADA: 'Cancelada',
  VENCIDA: 'Vencida',
} as const;

/** Mensajes de portería (H16). */
export const ENTRY_MESSAGES = {
  search:
    'Ingresa un código de 6 caracteres o un número de documento (6 a 12 letras, números o guiones).',
  unitId: 'Selecciona la unidad destino.',
  unitNotFound: 'La unidad no existe.',
  unitWithoutResidents: 'La unidad no tiene residentes registrados.',
  outsideHours: 'Fuera del horario de visitas.',
  alreadyInside: 'Este visitante ya está dentro. Registra su salida primero.',
  visitNotFound: 'La visita no existe.',
  notValidNow: 'La autorización no es válida en este horario.',
  /** 409 cuando la visita no está Autorizada. */
  wrongStatus: (label: string) =>
    `No se puede registrar la entrada: la visita está ${label}.`,
} as const;

/** Tamaño de página de "Mis visitas" (H15). */
export const MY_VISITS_PAGE_SIZE = 10;
export const MY_VISITS_MAX_PAGE_SIZE = 50;
/** Máximo del motivo de rechazo (H15). */
export const REJECT_REASON_MAX = 100;
/** Motivo que guarda la tarea cuando la solicitud vence sin respuesta (H15). */
export const NO_RESPONSE_REASON = 'Sin respuesta del residente';

/** Mensajes de "Mis visitas" (H15). */
export const MY_VISITS_MESSAGES = {
  tab: 'Elige la pestaña: activas o historial.',
  page: 'La página debe ser un número entero mayor o igual a 1.',
  pageSize: `El tamaño de página debe estar entre 1 y ${MY_VISITS_MAX_PAGE_SIZE}.`,
  decision: 'La respuesta debe ser APROBAR o RECHAZAR.',
  reason: `El motivo del rechazo puede tener máximo ${REJECT_REASON_MAX} caracteres.`,
  notFound: 'La visita no existe.',
  notAuthorized: 'Solo se pueden cancelar visitas Autorizadas.',
  notPending: 'La solicitud ya no está pendiente de autorización.',
  alreadyAnswered: 'Otro residente ya respondió esta solicitud.',
  expired: 'La solicitud venció: pasaron más de 15 minutos sin respuesta.',
  noReason: 'Sin motivo indicado',
} as const;

/** Mensajes de la salida de visitantes (H17). */
export const EXIT_MESSAGES = {
  visitNotFound: 'La visita no existe.',
  /** 409 cuando la visita no está Dentro. */
  notInside: 'Este visitante no tiene una entrada activa.',
} as const;
