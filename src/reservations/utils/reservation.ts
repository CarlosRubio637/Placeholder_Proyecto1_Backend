import { buildSlots, type AreaSchedule, type Slot } from './schedule.js';

/** Días hacia adelante que se puede reservar (H6, H7). */
export const MAX_DAYS_AHEAD = 30;

/** Reservas confirmadas futuras que puede tener una unidad (H7). */
export const MAX_ACTIVE_RESERVATIONS_PER_UNIT = 2;

/** "<areaId>|<fecha>|<inicio>": único mientras la reserva está CONFIRMADA. */
export function slotKey(areaId: string, date: string, startTime: string): string {
  return `${areaId}|${date}|${startTime}`;
}

/** RS-AAAAMMDD-NNNN con la fecha en que se hace la reserva y su consecutivo del día. */
export function reservationCode(createdOn: string, sequence: number): string {
  return `RS-${createdOn.replaceAll('-', '')}-${String(sequence).padStart(4, '0')}`;
}

/** Prefijo de los códigos creados un día, para contar el consecutivo. */
export function reservationCodePrefix(createdOn: string): string {
  return `RS-${createdOn.replaceAll('-', '')}-`;
}

/** La franja del horario que empieza a `startTime`, o null si no hay ninguna. */
export function findSlot(schedule: AreaSchedule, startTime: string): Slot | null {
  return buildSlots(schedule).find((slot) => slot.startTime === startTime) ?? null;
}
