import { TowersService } from './towers.service.js';
import type { PrismaService } from '../prisma/services/index.js';

describe('TowersService.findAll', () => {
  it('devuelve las torres ordenadas por letra, solo con id, nombre y letra', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 't-a', name: 'Torre A', letter: 'A' },
      { id: 't-b', name: 'Torre B', letter: 'B' },
    ]);
    const service = new TowersService({
      tower: { findMany },
    } as unknown as PrismaService);

    const result = await service.findAll();

    expect(findMany).toHaveBeenCalledWith({
      orderBy: { letter: 'asc' },
      select: { id: true, name: true, letter: true },
    });
    expect(result).toEqual([
      { id: 't-a', name: 'Torre A', letter: 'A' },
      { id: 't-b', name: 'Torre B', letter: 'B' },
    ]);
  });

  it('devuelve una lista vacía si no hay torres', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new TowersService({
      tower: { findMany },
    } as unknown as PrismaService);
    await expect(service.findAll()).resolves.toEqual([]);
  });
});
