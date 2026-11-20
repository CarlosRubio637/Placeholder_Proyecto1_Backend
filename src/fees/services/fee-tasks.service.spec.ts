import { Logger } from '@nestjs/common';
import { Prisma } from '@PrismaClient';
import { toDbDate } from '@Common/time';
import type { NotificationsService } from '@Notifications';
import { FeeTasksService } from './fee-tasks.service.js';
import type {
  FeeTaskCandidate,
  FeeTasksRepository,
} from '../repositories/index.js';

const AT_00_05 = new Date('2026-11-19T06:05:00.000Z');
const AT_08_00 = new Date('2026-11-19T14:00:00.000Z');

const overdueFee: FeeTaskCandidate = {
  id: 'fee-oct',
  unitId: 'unit-b203',
  period: '2026-10',
  amount: new Prisma.Decimal('35.50'),
  dueDate: toDbDate('2026-10-10'),
};

const upcomingFee: FeeTaskCandidate = {
  id: 'fee-nov',
  unitId: 'unit-b203',
  period: '2026-11',
  amount: new Prisma.Decimal('1250.5'),
  dueDate: toDbDate('2026-11-24'),
};

function setup() {
  const repository = {
    findOverdueCandidates: vi.fn().mockResolvedValue([overdueFee]),
    markOverdue: vi.fn().mockResolvedValue(true),
    findReminderCandidates: vi.fn().mockResolvedValue([upcomingFee]),
    markReminded: vi.fn().mockResolvedValue(true),
  };
  const notifications = { send: vi.fn().mockResolvedValue({ created: 2 }) };
  const service = new FeeTasksService(
    repository as unknown as FeeTasksRepository,
    notifications as unknown as NotificationsService,
  );
  return { service, repository, notifications };
}

describe('H5. Recordatorio de cuota por vencer y paso a Moroso', () => {
  it('AC1: pasa a Moroso las Pendiente que vencieron hace más de 30 días y guarda overdueAt', async () => {
    const { service, repository } = setup();

    const marked = await service.markOverdueFees(AT_00_05);

    expect(repository.findOverdueCandidates).toHaveBeenCalledWith(
      toDbDate('2026-10-19'),
    );
    expect(repository.markOverdue).toHaveBeenCalledWith('fee-oct', AT_00_05);
    expect(marked).toBe(1);
  });

  it('AC1 y AC2: a las 23:30 de El Salvador usa la fecha local aunque en UTC ya sea el día siguiente', async () => {
    const { service, repository, notifications } = setup();
    const at2330 = new Date('2026-11-19T05:30:00.000Z');

    await service.runAll(at2330);

    expect(repository.findOverdueCandidates).toHaveBeenCalledWith(
      toDbDate('2026-10-18'),
    );
    expect(repository.findReminderCandidates).toHaveBeenCalledWith(
      toDbDate('2026-11-18'),
      toDbDate('2026-11-23'),
    );
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Tu cuota octubre 2026 de $35.50 está en mora desde el 18/11/2026.',
      }),
    );
  });

  it('AC2: recuerda las Pendiente que vencen entre hoy y dentro de 5 días y guarda reminderSentAt', async () => {
    const { service, repository } = setup();

    const sent = await service.sendReminders(AT_08_00);

    expect(repository.findReminderCandidates).toHaveBeenCalledWith(
      toDbDate('2026-11-19'),
      toDbDate('2026-11-24'),
    );
    expect(repository.markReminded).toHaveBeenCalledWith('fee-nov', AT_08_00);
    expect(sent).toBe(1);
  });

  it('AC3: el recordatorio va a los residentes de la unidad con el texto de la card', async () => {
    const { service, notifications } = setup();

    await service.sendReminders(AT_08_00);

    expect(notifications.send).toHaveBeenCalledWith({
      recipient: { type: 'UNIDAD', ids: ['unit-b203'] },
      title: 'Cuota por vencer',
      message: 'Tu cuota noviembre 2026 de $1,250.50 vence el 24/11/2026.',
      sourceModule: 'CUOTAS',
      reference: { type: 'fee', id: 'fee-nov' },
    });
  });

  it('AC4: al pasar a Moroso avisa desde cuándo está en mora', async () => {
    const { service, notifications } = setup();

    await service.markOverdueFees(AT_00_05);

    expect(notifications.send).toHaveBeenCalledWith({
      recipient: { type: 'UNIDAD', ids: ['unit-b203'] },
      title: 'Cuota en mora',
      message:
        'Tu cuota octubre 2026 de $35.50 está en mora desde el 19/11/2026.',
      sourceModule: 'CUOTAS',
      reference: { type: 'fee', id: 'fee-oct' },
    });
  });

  it('AC5: si la cuota ya cambió en otra corrida, no repite el aviso ni la cuenta', async () => {
    const { service, repository, notifications } = setup();
    repository.markOverdue.mockResolvedValue(false);
    repository.markReminded.mockResolvedValue(false);

    const result = await service.runAll(AT_08_00);

    expect(result).toEqual({ markedOverdue: 0, remindersSent: 0 });
    expect(notifications.send).not.toHaveBeenCalled();
  });

  it('AC1 y AC2: ejecutar las tareas corre las dos y devuelve los conteos', async () => {
    const { service, repository } = setup();

    const result = await service.runAll(AT_08_00);

    expect(result).toEqual({ markedOverdue: 1, remindersSent: 1 });
    expect(repository.markOverdue).toHaveBeenCalledBefore(
      repository.markReminded,
    );
  });
});

describe('avisos de H5', () => {
  it('si el aviso falla, lo registra en el log, la cuota queda actualizada y la corrida sigue', async () => {
    const { service, notifications } = setup();
    notifications.send.mockRejectedValue(new Error('sin conexión'));
    const logError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const result = await service.runAll(AT_08_00);

    expect(result).toEqual({ markedOverdue: 1, remindersSent: 1 });
    expect(logError).toHaveBeenCalledTimes(2);
    logError.mockRestore();
  });
});
