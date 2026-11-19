import { UnitsService } from './units.service.js';
import type { PrismaService } from '../prisma/services/index.js';

describe('UnitsService.findByTower', () => {
  it('filtra por torre, ordena por código y no expone el código de registro', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'u1', code: 'A-101', number: '101', _count: { residents: 2 } },
      { id: 'u2', code: 'A-102', number: '102', _count: { residents: 0 } },
    ]);
    const service = new UnitsService({
      unit: { findMany },
    } as unknown as PrismaService);

    const result = await service.findByTower('t-a');

    const args = findMany.mock.calls[0][0];
    expect(args).toMatchObject({
      where: { towerId: 't-a' },
      orderBy: { code: 'asc' },
    });
    // El código de registro solo lo entrega la administración (H38).
    expect(args.select).not.toHaveProperty('registrationCode');
    expect(result).toEqual([
      { id: 'u1', code: 'A-101', number: '101', residentCount: 2 },
      { id: 'u2', code: 'A-102', number: '102', residentCount: 0 },
    ]);
  });

  it('residentCount cuenta solo los residentes activos (H16)', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new UnitsService({
      unit: { findMany },
    } as unknown as PrismaService);

    await service.findByTower('t-a');

    expect(findMany.mock.calls[0][0].select._count).toEqual({
      select: { residents: { where: { isActive: true } } },
    });
  });

  it('sigue respondiendo una lista, como la usa paquetería (H19)', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new UnitsService({
      unit: { findMany },
    } as unknown as PrismaService);
    await expect(service.findByTower('no-existe')).resolves.toEqual([]);
  });
});
