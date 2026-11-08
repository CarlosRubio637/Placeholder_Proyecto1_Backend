import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, type User } from '@PrismaClient';
import { FeeGenerationsService } from './fee-generations.service.js';
import type { FeeGenerationRepository } from '../repositories/index.js';
import {
  NoActiveUnitsError,
  PeriodAlreadyGeneratedError,
} from '../errors/index.js';

const NOW = new Date('2026-11-07T00:30:00.000Z');
const admin = { id: 'admin-1', role: 'ADMINISTRADOR' } as User;
const dto = { period: '2026-12', amount: 35.5, dueDate: '2026-12-10' };

function generation(
  createdBy: object = {
    id: 'admin-1',
    email: 'admin@condominio.test',
    profile: { fullName: 'Ana Paz' },
  },
) {
  return {
    id: 'gen-1',
    period: '2026-12',
    amount: new Prisma.Decimal('35.50'),
    dueDate: new Date('2026-12-10T00:00:00.000Z'),
    concept: 'Cuota de mantenimiento diciembre 2026',
    createdCount: 5,
    skippedCount: 1,
    createdById: 'admin-1',
    createdAt: NOW,
    createdBy,
  };
}

function setup() {
  const repository = {
    countUnitsForPeriod: vi
      .fn()
      .mockResolvedValue({ activeUnits: 6, alreadyGenerated: 1 }),
    generate: vi.fn().mockResolvedValue(generation()),
    findPage: vi.fn().mockResolvedValue({ items: [generation()], total: 11 }),
  };
  const service = new FeeGenerationsService(
    repository as unknown as FeeGenerationRepository,
  );
  return { service, repository };
}

async function badRequestOf(promise: Promise<unknown>) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(BadRequestException);
  return (error as BadRequestException).getResponse() as {
    field: string;
    message: string[];
  };
}

describe('FeeGenerationsService', () => {
  it('genera con el concepto por defecto y responde creadas, omitidas y autor', async () => {
    const { service, repository } = setup();
    const result = await service.generate(admin, dto, NOW);

    const data = repository.generate.mock.calls[0][0];
    expect(data).toMatchObject({
      period: '2026-12',
      concept: 'Cuota de mantenimiento diciembre 2026',
      createdById: 'admin-1',
    });
    expect(data.amount.toFixed(2)).toBe('35.50');
    expect(data.dueDate.toISOString()).toBe('2026-12-10T00:00:00.000Z');
    expect(result).toEqual({
      id: 'gen-1',
      period: '2026-12',
      amount: 35.5,
      dueDate: '2026-12-10',
      concept: 'Cuota de mantenimiento diciembre 2026',
      createdCount: 5,
      skippedCount: 1,
      createdAt: NOW,
      createdBy: { id: 'admin-1', name: 'Ana Paz' },
    });
  });

  it('respeta el concepto que escribe el administrador', async () => {
    const { service, repository } = setup();
    await service.generate(admin, { ...dto, concept: 'Cuota extra' }, NOW);
    expect(repository.generate.mock.calls[0][0].concept).toBe('Cuota extra');
  });

  it('guarda 19.99 exacto como Decimal', async () => {
    const { service, repository } = setup();
    await service.generate(admin, { ...dto, amount: 19.99 }, NOW);
    expect(
      repository.generate.mock.calls[0][0].amount.equals(
        new Prisma.Decimal('19.99'),
      ),
    ).toBe(true);
  });

  it('usa el correo como nombre del autor si la cuenta no tiene perfil', async () => {
    const { service, repository } = setup();
    repository.generate.mockResolvedValue(
      generation({
        id: 'admin-1',
        email: 'admin@condominio.test',
        profile: null,
      }),
    );
    const result = await service.generate(admin, dto, NOW);
    expect(result.createdBy.name).toBe('admin@condominio.test');
  });

  it('responde 409 con el periodo en palabras si todas las unidades activas ya tienen cuota', async () => {
    const { service, repository } = setup();
    repository.generate.mockRejectedValue(
      new PeriodAlreadyGeneratedError('2026-12'),
    );
    await expect(service.generate(admin, dto, NOW)).rejects.toThrow(
      new ConflictException(
        'Las cuotas del periodo diciembre 2026 ya fueron generadas para todas las unidades.',
      ),
    );
  });

  it('responde 409 si no hay unidades activas', async () => {
    const { service, repository } = setup();
    repository.generate.mockRejectedValue(new NoActiveUnitsError());
    await expect(service.generate(admin, dto, NOW)).rejects.toThrow(
      new ConflictException('No hay unidades activas para generar cuotas.'),
    );
  });

  it.each(['2026-10', '2027-03'])(
    'rechaza en period el periodo %s fuera de la ventana',
    async (period) => {
      const { service, repository } = setup();
      const body = await badRequestOf(
        service.generate(
          admin,
          { ...dto, period, dueDate: `${period}-10` },
          NOW,
        ),
      );
      expect(body).toMatchObject({
        field: 'period',
        message: [
          'El periodo debe estar entre el mes actual y 3 meses adelante.',
        ],
      });
      expect(repository.generate).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['2026-12', '2027-01-10'],
    ['2026-11', '2026-11-05'],
  ])(
    'rechaza en dueDate el vencimiento del periodo %s el %s',
    async (period, dueDate) => {
      const { service, repository } = setup();
      const body = await badRequestOf(
        service.generate(admin, { ...dto, period, dueDate }, NOW),
      );
      expect(body).toMatchObject({
        field: 'dueDate',
        message: [
          'La fecha de vencimiento debe estar dentro del periodo y no puede ser anterior a hoy.',
        ],
      });
      expect(repository.generate).not.toHaveBeenCalled();
    },
  );

  it('toma el mes actual en hora de El Salvador aunque en UTC ya sea el mes siguiente', async () => {
    const { service } = setup();
    const lateNovember = new Date('2026-12-01T03:00:00.000Z');
    await expect(service.preview('2026-11', lateNovember)).resolves.toEqual({
      activeUnits: 6,
      alreadyGenerated: 1,
      toCreate: 5,
    });
    const body = await badRequestOf(service.preview('2027-03', lateNovember));
    expect(body.field).toBe('period');
  });

  it('la vista previa resta las unidades que ya tienen cuota', async () => {
    const { service, repository } = setup();
    expect(await service.preview('2026-12', NOW)).toEqual({
      activeUnits: 6,
      alreadyGenerated: 1,
      toCreate: 5,
    });
    expect(repository.countUnitsForPeriod).toHaveBeenCalledWith('2026-12');
  });

  it('lista el historial con la página pedida', async () => {
    const { service, repository } = setup();
    const page = await service.list({ page: 2, pageSize: 10 });
    expect(repository.findPage).toHaveBeenCalledWith(2, 10);
    expect(page).toMatchObject({ total: 11, page: 2, pageSize: 10 });
    expect(page.data[0]).toMatchObject({
      amount: 35.5,
      dueDate: '2026-12-10',
      createdBy: { id: 'admin-1', name: 'Ana Paz' },
    });
  });
});
