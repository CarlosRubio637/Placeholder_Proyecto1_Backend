import { UnitsService } from './units.service.js';
import type { PrismaService } from '../prisma/services/index.js';

describe('UnitsService.findByTower', () => {
  it('filtra por torre, ordena por código y no expone el código de registro', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'u1', code: 'A-101', number: '101' },
      { id: 'u2', code: 'A-102', number: '102' },
    ]);
    const service = new UnitsService({
      unit: { findMany },
    } as unknown as PrismaService);

    const result = await service.findByTower('t-a');

    const args = findMany.mock.calls[0][0];
    expect(args).toEqual({
      where: { towerId: 't-a' },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, number: true },
    });
    // El código de registro solo lo entrega la administración (H38).
    expect(args.select).not.toHaveProperty('registrationCode');
    expect(result).toEqual([
      { id: 'u1', code: 'A-101', number: '101' },
      { id: 'u2', code: 'A-102', number: '102' },
    ]);
  });

  it('devuelve una lista vacía si la torre no tiene unidades o no existe', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new UnitsService({
      unit: { findMany },
    } as unknown as PrismaService);
    await expect(service.findByTower('no-existe')).resolves.toEqual([]);
  });
});
