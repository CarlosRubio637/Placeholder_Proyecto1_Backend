import type { PrismaService } from '@Prisma/services';
import { toDbDate } from '@Common/time';
import { FeeTasksRepository } from './fee-tasks.repository.js';

const NOW = new Date('2026-11-19T06:05:00.000Z');

function setup(updatedRows = 1) {
  const fee = {
    findMany: vi.fn().mockResolvedValue([]),
    updateMany: vi.fn().mockResolvedValue({ count: updatedRows }),
  };
  const repository = new FeeTasksRepository({
    fee,
  } as unknown as PrismaService);
  return { repository, fee };
}

describe('H5. Recordatorio de cuota por vencer y paso a Moroso', () => {
  it('AC6: para la mora solo busca cuotas Pendiente vencidas hasta la fecha límite', async () => {
    const { repository, fee } = setup();

    await repository.findOverdueCandidates(toDbDate('2026-10-19'));

    expect(fee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'PENDIENTE',
          dueDate: { lte: toDbDate('2026-10-19') },
        },
      }),
    );
  });

  it('AC6: solo cambia a Moroso una cuota que sigue Pendiente', async () => {
    const { repository, fee } = setup();

    const changed = await repository.markOverdue('fee-oct', NOW);

    expect(fee.updateMany).toHaveBeenCalledWith({
      where: { id: 'fee-oct', status: 'PENDIENTE' },
      data: { status: 'MOROSO', overdueAt: NOW },
    });
    expect(changed).toBe(true);
  });

  it('AC2: busca las Pendiente sin recordatorio que vencen dentro de la ventana', async () => {
    const { repository, fee } = setup();

    await repository.findReminderCandidates(
      toDbDate('2026-11-19'),
      toDbDate('2026-11-24'),
    );

    expect(fee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'PENDIENTE',
          reminderSentAt: null,
          dueDate: { gte: toDbDate('2026-11-19'), lte: toDbDate('2026-11-24') },
        },
      }),
    );
  });

  it('AC5: el recordatorio solo se guarda si la cuota todavía no tenía uno', async () => {
    const { repository, fee } = setup();

    await repository.markReminded('fee-nov', NOW);

    expect(fee.updateMany).toHaveBeenCalledWith({
      where: { id: 'fee-nov', status: 'PENDIENTE', reminderSentAt: null },
      data: { reminderSentAt: NOW },
    });
  });

  it('AC5: informa que no cambió nada cuando otra corrida ya actualizó la cuota', async () => {
    const { repository } = setup(0);

    expect(await repository.markOverdue('fee-oct', NOW)).toBe(false);
    expect(await repository.markReminded('fee-nov', NOW)).toBe(false);
  });
});
