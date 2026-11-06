/** Horario de un área: apertura, cierre y duración de la franja. */
export interface AreaSchedule {
  openTime: string;
  closeTime: string;
  slotMinutes: number;
}

export interface Slot {
  startTime: string;
  endTime: string;
}

/** "HH:mm" → minutos desde la medianoche. */
export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Minutos desde la medianoche → "HH:mm". */
export function toTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Error de horario con el campo que falló, para responder 400 (H9). */
export interface ScheduleError {
  field: 'closeTime';
  message: string;
}

/**
 * Valida el horario completo (H9): el cierre posterior a la apertura y una
 * duración que se divida en franjas completas. El formato "HH:mm" en pasos
 * de 30 minutos y la franja de 60 o 120 los valida el DTO.
 */
export function validateSchedule(schedule: AreaSchedule): ScheduleError | null {
  const open = toMinutes(schedule.openTime);
  const close = toMinutes(schedule.closeTime);

  if (close <= open) {
    return {
      field: 'closeTime',
      message: 'La hora de cierre debe ser posterior a la de apertura.',
    };
  }
  if ((close - open) % schedule.slotMinutes !== 0) {
    return {
      field: 'closeTime',
      message: `El horario debe dividirse en franjas completas de ${schedule.slotMinutes} minutos.`,
    };
  }
  return null;
}

/** Franjas del horario: 08:00-20:00 de 120 min → 08:00-10:00, ..., 18:00-20:00. */
export function buildSlots(schedule: AreaSchedule): Slot[] {
  const slots: Slot[] = [];
  const close = toMinutes(schedule.closeTime);
  for (
    let start = toMinutes(schedule.openTime);
    start + schedule.slotMinutes <= close;
    start += schedule.slotMinutes
  ) {
    slots.push({
      startTime: toTime(start),
      endTime: toTime(start + schedule.slotMinutes),
    });
  }
  return slots;
}

export function sameSchedule(a: AreaSchedule, b: AreaSchedule): boolean {
  return (
    a.openTime === b.openTime &&
    a.closeTime === b.closeTime &&
    a.slotMinutes === b.slotMinutes
  );
}

/** Lo mínimo de una reserva que hace falta para decidir si se cancela. */
export interface ReservationSlot extends Slot {
  id: string;
}

/** Motivos de cancelación por cambios del área (H9). */
export const CANCEL_REASONS = {
  disabled: 'el área fue deshabilitada por la administración',
  schedule: 'cambió el horario del área',
} as const;

/**
 * Qué reservas futuras confirmadas cancela un cambio del área (H9):
 * - Deshabilitarla: todas.
 * - Cambiar horario o franja: las que ya no coinciden con una franja nueva.
 * - Cualquier otro cambio (nombre, aforo, reglas): ninguna.
 */
export function reservationsAffectedByChange(
  next: AreaSchedule & { isActive: boolean },
  current: AreaSchedule,
  futureReservations: ReservationSlot[],
): { ids: string[]; reason: string } {
  if (!next.isActive) {
    return { ids: futureReservations.map((r) => r.id), reason: CANCEL_REASONS.disabled };
  }
  if (sameSchedule(next, current)) {
    return { ids: [], reason: CANCEL_REASONS.schedule };
  }
  const valid = new Set(buildSlots(next).map((s) => `${s.startTime}-${s.endTime}`));
  return {
    ids: futureReservations
      .filter((r) => !valid.has(`${r.startTime}-${r.endTime}`))
      .map((r) => r.id),
    reason: CANCEL_REASONS.schedule,
  };
}
