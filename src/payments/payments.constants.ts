/** Mensajes y reglas de H1 (pago de cuotas) y H2 (estado de cuenta). */
export const PAYMENT_MESSAGES = {
  idempotencyKey: 'La llave de idempotencia debe ser un uuid.',
  cardNumber: 'Ingresa los 16 dígitos de la tarjeta.',
  expiry: 'Fecha de vencimiento inválida o vencida (MM/AA).',
  cvv: 'Ingresa los 3 dígitos del código de seguridad.',
  holderName: 'Ingresa el nombre como aparece en la tarjeta (3 a 60 letras).',
  feeNotFound: 'La cuota no existe.',
  paymentNotFound: 'El pago no existe.',
  alreadyPaid: 'Esta cuota ya está pagada.',
  keyReused: 'La llave de idempotencia ya se usó en otro pago.',
} as const;

export const STATEMENT_MESSAGES = {
  year: 'El año debe ser un entero de 2020 a 2100.',
  status: 'El estado debe ser PENDIENTE, PAGADO o MOROSO.',
  page: 'La página debe ser un entero mayor o igual a 1.',
  pageSize: 'El tamaño de página debe ser un entero de 1 a 50.',
  unitNotFound: 'La unidad no existe.',
} as const;

export const GATEWAY_REASONS = {
  insufficientFunds: 'Fondos insuficientes',
  unknownCard: 'Tarjeta no reconocida por la pasarela de prueba',
} as const;

export const STATEMENT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 50;

/** Alfabeto del código de registro, sin caracteres ambiguos (H2). */
export const REGISTRATION_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const REGISTRATION_CODE_LENGTH = 8;
