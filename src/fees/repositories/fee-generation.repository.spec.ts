import { toDbDate } from '@Common/time';
import type { PrismaService } from '@Prisma/services';
import { Prisma } from '@PrismaClient';
import {
  NoActiveUnitsError,
  PeriodAlreadyGeneratedError,
} from '../errors/index.js';
import { FeeGenerationRepository } from './fee-generation.repository.js';

const ACTIVE_UNIT = {
  residents: { some: { role: 'RESIDENTE', isActive: true } },
};

const december = {
  period: '2026-12',
  amount: new Prisma.Decimal('35.50'),
  dueDate: toDbDate('2026-12-10'),
  concept: 'Cuota de mantenimiento diciembre 2026',
  createdById: 'admin-1',
};

type TransactionWork = (client: unknown) => Promise<unknown>;

function setup(activeUnitIds: string[], createdFees: number) {
  const tx = {
    unit: {
      findMany: vi.fn().mockResolvedValue(activeUnitIds.map((id) => ({ id }))),
    },
    feeGeneration: {
      create: vi.fn().mockResolvedValue({ id: 'gen-1' }),
      update: vi.fn().mockResolvedValue({ id: 'gen-1' }),
    },
    fee: {
      createMany: vi.fn().mockResolvedValue({ count: createdFees }),
    },
  };
  const prisma = {
    $transaction: vi.fn((work: TransactionWork | Promise<unknown>[]) =>
      typeof work === 'function' ? work(tx) : Promise.all(work),
    ),
    unit: { count: vi.fn().mockResolvedValue(0) },
    feeGeneration: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  };
  const repository = new FeeGenerationRepository(
    prisma as unknown as PrismaService,
  );
  return { repository, prisma, tx };
}

function feeFor(unitId: string) {
  return {
    unitId,
    generationId: 'gen-1',
    period: '2026-12',
    concept: 'Cuota de mantenimiento diciembre 2026',
    amount: december.amount,
    dueDate: december.dueDate,
  };
}

describe('H3. Generación mensual de cuotas', () => {
  it('AC2: cuenta las unidades activas y las que ya tienen cuota del periodo', async () => {
    const { repository, prisma } = setup([], 0);
    prisma.unit.count.mockResolvedValueOnce(6).mockResolvedValueOnce(1);

    await expect(repository.countUnitsForPeriod('2026-12')).resolves.toEqual({
      activeUnits: 6,
      alreadyGenerated: 1,
    });
    expect(prisma.unit.count).toHaveBeenCalledWith({ where: ACTIVE_UNIT });
    expect(prisma.unit.count).toHaveBeenCalledWith({
      where: { ...ACTIVE_UNIT, fees: { some: { period: '2026-12' } } },
    });
  });

  it('AC3: el historial va de la generación más reciente a la más antigua', async () => {
    const { repository, prisma } = setup([], 0);

    await repository.findPage(2, 10);

    expect(prisma.feeGeneration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 10,
        take: 10,
      }),
    );
  });

  it('AC4: en una sola transacción crea una cuota Pendiente por unidad activa con el mismo monto, concepto y vencimiento', async () => {
    const { repository, prisma, tx } = setup(['unit-a', 'unit-b', 'unit-c'], 3);

    await repository.generate(december);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.feeGeneration.create).toHaveBeenCalledWith({
      data: { ...december, createdCount: 0, skippedCount: 0 },
    });
    expect(tx.fee.createMany).toHaveBeenCalledWith({
      data: [feeFor('unit-a'), feeFor('unit-b'), feeFor('unit-c')],
      skipDuplicates: true,
    });
    expect(tx.feeGeneration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'gen-1' },
        data: { createdCount: 3, skippedCount: 0 },
      }),
    );
  });

  it('AC5: al generar otra vez el mismo mes omite las unidades que ya tienen cuota', async () => {
    const { repository, tx } = setup(['unit-a', 'unit-b', 'unit-c'], 1);

    await repository.generate(december);

    expect(tx.fee.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(tx.feeGeneration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { createdCount: 1, skippedCount: 2 },
      }),
    );
  });

  it('AC5: si todas las unidades ya tenían cuota revierte la generación y avisa el periodo', async () => {
    const { repository, tx } = setup(['unit-a', 'unit-b'], 0);

    const error = await repository
      .generate(december)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(PeriodAlreadyGeneratedError);
    expect((error as PeriodAlreadyGeneratedError).period).toBe('2026-12');
    expect(tx.feeGeneration.update).not.toHaveBeenCalled();
  });

  it('AC8: solo genera para las unidades con al menos un residente activo', async () => {
    const { repository, tx } = setup(['unit-a'], 1);

    await repository.generate(december);

    expect(tx.unit.findMany).toHaveBeenCalledWith({
      where: ACTIVE_UNIT,
      select: { id: true },
    });
  });

  it('AC8: una unidad registrada después de la generación recibe su cuota al volver a generar el periodo', async () => {
    const { repository, tx } = setup(['unit-a', 'unit-b', 'unit-new'], 1);

    await repository.generate(december);

    const [{ data: fees }] = tx.fee.createMany.mock.calls[0] as [
      { data: { unitId: string }[] },
    ];
    expect(fees.map((fee) => fee.unitId)).toContain('unit-new');
    expect(tx.feeGeneration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { createdCount: 1, skippedCount: 2 },
      }),
    );
  });
});

describe('FeeGenerationRepository', () => {
  it('sin unidades activas no registra la generación', async () => {
    const { repository, tx } = setup([], 0);

    await expect(repository.generate(december)).rejects.toBeInstanceOf(
      NoActiveUnitsError,
    );
    expect(tx.feeGeneration.create).not.toHaveBeenCalled();
    expect(tx.fee.createMany).not.toHaveBeenCalled();
  });
});
