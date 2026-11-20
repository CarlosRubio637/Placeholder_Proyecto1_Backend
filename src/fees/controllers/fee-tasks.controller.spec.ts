import { ROLES_KEY } from '@Auth/decorators';
import { FeeTasksController } from './fee-tasks.controller.js';
import type { FeeTasksService } from '../services/index.js';

describe('H5. Recordatorio de cuota por vencer y paso a Moroso', () => {
  it('AC1 y AC2: POST /cuotas/tareas/ejecutar corre las dos tareas y responde los conteos', async () => {
    const tasks = {
      runAll: vi.fn().mockResolvedValue({ markedOverdue: 2, remindersSent: 1 }),
    };
    const controller = new FeeTasksController(
      tasks as unknown as FeeTasksService,
    );

    await expect(controller.run()).resolves.toEqual({
      markedOverdue: 2,
      remindersSent: 1,
    });
  });
});

describe('POST /cuotas/tareas/ejecutar', () => {
  it('solo el Administrador puede ejecutar las tareas', () => {
    expect(Reflect.getMetadata(ROLES_KEY, FeeTasksController)).toEqual([
      'ADMINISTRADOR',
    ]);
  });
});
