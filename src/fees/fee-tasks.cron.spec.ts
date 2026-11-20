import { Logger } from '@nestjs/common';
import { FeeTasksCron } from './fee-tasks.cron.js';
import type { FeeTasksService } from './services/index.js';

function cronOptions(method: keyof FeeTasksCron) {
  return Reflect.getMetadata(
    'SCHEDULE_CRON_OPTIONS',
    FeeTasksCron.prototype[method],
  ) as { cronTime: string; timeZone: string };
}

function pending<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('H5. Recordatorio de cuota por vencer y paso a Moroso', () => {
  it('AC1: la tarea de mora corre todos los días a las 00:05 de El Salvador', () => {
    expect(cronOptions('markOverdue')).toMatchObject({
      cronTime: '5 0 * * *',
      timeZone: 'America/El_Salvador',
    });
  });

  it('AC2: la tarea de recordatorios corre todos los días a las 08:00 de El Salvador', () => {
    expect(cronOptions('sendReminders')).toMatchObject({
      cronTime: '0 8 * * *',
      timeZone: 'America/El_Salvador',
    });
  });
});

describe('tareas programadas de H5', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('no empieza una corrida de la misma tarea mientras la anterior sigue en curso', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const run = pending<number>();
    const tasks = { markOverdueFees: vi.fn(() => run.promise) };
    const cron = new FeeTasksCron(tasks as unknown as FeeTasksService);

    const first = cron.markOverdue();
    await cron.markOverdue();
    run.resolve(0);
    await first;

    expect(tasks.markOverdueFees).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'La tarea fees-overdue sigue en curso; se omite esta corrida',
    );
  });

  it('una tarea en curso no bloquea a la otra', async () => {
    const run = pending<number>();
    const tasks = {
      markOverdueFees: vi.fn(() => run.promise),
      sendReminders: vi.fn().mockResolvedValue(1),
    };
    const cron = new FeeTasksCron(tasks as unknown as FeeTasksService);

    const overdue = cron.markOverdue();
    await cron.sendReminders();
    run.resolve(0);
    await overdue;

    expect(tasks.sendReminders).toHaveBeenCalledTimes(1);
  });

  it('si una corrida falla, la siguiente vuelve a correr', async () => {
    const tasks = {
      markOverdueFees: vi
        .fn()
        .mockRejectedValueOnce(new Error('base caída'))
        .mockResolvedValueOnce(2),
    };
    const cron = new FeeTasksCron(tasks as unknown as FeeTasksService);

    await expect(cron.markOverdue()).rejects.toThrow('base caída');
    await cron.markOverdue();

    expect(tasks.markOverdueFees).toHaveBeenCalledTimes(2);
  });
});
