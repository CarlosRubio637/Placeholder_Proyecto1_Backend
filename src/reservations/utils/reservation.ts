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

export type SlotStatus = 'DISPONIBLE' | 'RESERVADO' | 'MANTENIMIENTO' | 'PASADO';

export interface AvailabilitySlot extends Slot {
  status: SlotStatus;
  /** Reserva de la unidad que consulta en esta franja; null en cualquier otro caso. */
  ownReservationId: string | null;
}

/**
 * Estado de las franjas de un día (H6). Una franja cuya hora de inicio ya pasó
 * es PASADO aunque tenga reserva; después manda el bloqueo y luego la reserva.
 * El resultado no incluye de qué unidad es una reserva ajena.
 */
export function buildAvailability(params: {
  schedule: AreaSchedule;
  /** La fecha consultada está dentro de un bloqueo del área. */
  blocked: boolean;
  /** Si la fecha consultada es hoy, "HH:mm" actual; si es futura, null. */
  currentTime: string | null;
  reservations: { id: string; startTime: string; unitId: string }[];
  /** Unidad de quien consulta; null para el Administrador. */
  unitId: string | null;
}): AvailabilitySlot[] {
  const byStart = new Map(params.reservations.map((r) => [r.startTime, r]));

  return buildSlots(params.schedule).map((slot) => {
    const reservation = byStart.get(slot.startTime);
    let status: SlotStatus = 'DISPONIBLE';
    if (params.currentTime !== null && slot.startTime <= params.currentTime) {
      status = 'PASADO';
    } else if (params.blocked) {
      status = 'MANTENIMIENTO';
    } else if (reservation) {
      status = 'RESERVADO';
    }
    return {
      ...slot,
      status,
      ownReservationId:
        reservation && params.unitId !== null && reservation.unitId === params.unitId
          ? reservation.id
          : null,
    };
  });
}
