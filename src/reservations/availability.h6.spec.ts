// Los handlers del controlador se pasan sin llamarlos: RolesGuard lee su
// metadata @Roles. Los DTO de prueba son objetos planos, no instancias.
/* oxlint-disable typescript/unbound-method, typescript/no-misused-spread */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@Auth/guards';
import type { NotificationsService } from '@Notifications';
import type { PrismaService } from '@Prisma/services';
import type { CommonArea, Role, User } from '@PrismaClient';
import { AreasController } from './controllers/index.js';
import { ReservationRepository } from './repositories/index.js';
import { ReservationsService } from './services/index.js';
import { buildAvailability } from './utils/index.js';

// Domingo 22 de noviembre de 2026, 12:00 en El Salvador.
const NOW = new Date('2026-11-22T18:00:00Z');
const RESIDENT = { id: 'user-1', role: 'RESIDENTE', unitId: 'unit-1' } as User;

const AREA = {
  id: 'area-1',
  name: 'Piscina',
  capacity: 10,
  rules: null,
  openTime: '08:00',
  closeTime: '20:00',
  slotMinutes: 60,
  isActive: true,
} as CommonArea;

const OWN = { id: 'res-own', startTime: '10:00', unitId: 'unit-1' };
const OTHER = { id: 'res-other', startTime: '11:00', unitId: 'unit-2' };

/** Servicio con el repositorio real sobre un Prisma simulado. */
function setup() {
  const prisma = {
    commonArea: {
      findMany: vi.fn().mockResolvedValue([AREA]),
      findFirst: vi.fn().mockResolvedValue(AREA),
    },
    areaBlock: { findFirst: vi.fn().mockResolvedValue(null) },
    reservation: { findMany: vi.fn().mockResolvedValue([OWN, OTHER]) },
  };
  const service = new ReservationsService(
    new ReservationRepository(prisma as unknown as PrismaService),
    { send: vi.fn() } as unknown as NotificationsService,
  );
  return { prisma, service };
}

function requestAs(role: Role): ExecutionContext {
  return {
    getHandler: () => AreasController.prototype.availability,
    getClass: () => AreasController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H6. Consulta de disponibilidad de áreas comunes', () => {
  it('AC6: con franjas de 60 minutos de 08:00 a 20:00 calcula 12 franjas consecutivas', () => {
    const slots = buildAvailability({
      schedule: AREA,
      blocked: false,
      currentTime: null,
      reservations: [],
      unitId: 'unit-1',
    });

    expect(slots).toHaveLength(12);
    expect(slots[0]).toMatchObject({ startTime: '08:00', endTime: '09:00' });
    expect(slots[11]).toMatchObject({ startTime: '19:00', endTime: '20:00' });
    expect(slots.every((s) => s.status === 'DISPONIBLE')).toBe(true);
  });

  it('AC6: con franjas de 120 minutos calcula 6 franjas', () => {
    const slots = buildAvailability({
      schedule: { ...AREA, slotMinutes: 120 },
      blocked: false,
      currentTime: null,
      reservations: [],
      unitId: 'unit-1',
    });

    expect(slots.map((s) => s.startTime)).toEqual([
      '08:00',
      '10:00',
      '12:00',
      '14:00',
      '16:00',
      '18:00',
    ]);
  });

  it('AC6: una franja con reserva Confirmada es Reservado', async () => {
    const { prisma, service } = setup();

    const { slots } = await service.availability(
      RESIDENT,
      AREA.id,
      '2026-11-23',
      NOW,
    );

    expect(prisma.reservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'CONFIRMADA' }),
      }),
    );
    expect(slots.find((s) => s.startTime === '11:00')?.status).toBe(
      'RESERVADO',
    );
    expect(slots.find((s) => s.startTime === '12:00')?.status).toBe(
      'DISPONIBLE',
    );
  });

  it('AC6: si la fecha está dentro de un bloqueo, las franjas son Mantenimiento', async () => {
    const { prisma, service } = setup();
    prisma.areaBlock.findFirst.mockResolvedValue({ id: 'block-1' });

    const { slots } = await service.availability(
      RESIDENT,
      AREA.id,
      '2026-11-23',
      NOW,
    );

    expect(slots.every((s) => s.status === 'MANTENIMIENTO')).toBe(true);
  });

  it('AC6: hoy, las franjas cuya hora de inicio ya pasó son Pasado', async () => {
    const { service } = setup();

    const { slots } = await service.availability(
      RESIDENT,
      AREA.id,
      '2026-11-22',
      NOW,
    );

    expect(slots.find((s) => s.startTime === '12:00')?.status).toBe('PASADO');
    expect(slots.find((s) => s.startTime === '13:00')?.status).toBe(
      'DISPONIBLE',
    );
  });

  it('AC7: marca solo las franjas de la unidad que consulta y no revela la unidad de las ajenas', async () => {
    const { service } = setup();

    const { slots } = await service.availability(
      RESIDENT,
      AREA.id,
      '2026-11-23',
      NOW,
    );

    const own = slots.find((s) => s.startTime === '10:00');
    const other = slots.find((s) => s.startTime === '11:00');
    expect(own).toMatchObject({
      status: 'RESERVADO',
      ownReservationId: 'res-own',
    });
    expect(other).toMatchObject({
      status: 'RESERVADO',
      ownReservationId: null,
    });
    const text = JSON.stringify(slots);
    expect(text).not.toContain('unit-2');
    expect(text).not.toContain('res-other');
    expect(Object.keys(other ?? {})).toEqual([
      'startTime',
      'endTime',
      'status',
      'ownReservationId',
    ]);
  });

  it.each([
    ['ayer', '2026-11-21'],
    ['hoy + 31 días', '2026-12-23'],
  ])(
    'AC8: rechaza %s con 400 y "La fecha debe estar entre hoy y <fecha límite>."',
    async (_, date) => {
      const { service } = setup();

      const error = await service
        .availability(RESIDENT, AREA.id, date, NOW)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        field: 'date',
        message: ['La fecha debe estar entre hoy y 22/12/2026.'],
      });
    },
  );

  it('AC8: acepta hoy y hoy + 30 días', async () => {
    const { service } = setup();

    await expect(
      service.availability(RESIDENT, AREA.id, '2026-11-22', NOW),
    ).resolves.toBeDefined();
    await expect(
      service.availability(RESIDENT, AREA.id, '2026-12-22', NOW),
    ).resolves.toBeDefined();
  });

  it('AC8: 404 si el área no existe o está deshabilitada', async () => {
    const { prisma, service } = setup();
    prisma.commonArea.findFirst.mockResolvedValue(null);

    const error = await service
      .availability(RESIDENT, 'area-x', '2026-11-23', NOW)
      .catch((e: unknown) => e);

    expect(prisma.commonArea.findFirst).toHaveBeenCalledWith({
      where: { id: 'area-x', isActive: true },
    });
    expect(error).toBeInstanceOf(NotFoundException);
  });

  describe('AC9: permisos de la disponibilidad', () => {
    const guard = new RolesGuard(new Reflector());

    it('AC9: el Personal de seguridad recibe 403', () => {
      expect(() => guard.canActivate(requestAs('SEGURIDAD'))).toThrow(
        ForbiddenException,
      );
    });

    it.each<Role>(['RESIDENTE', 'ADMINISTRADOR'])(
      'AC9: %s sí consulta la disponibilidad',
      (role) => {
        expect(guard.canActivate(requestAs(role))).toBe(true);
      },
    );
  });
});
