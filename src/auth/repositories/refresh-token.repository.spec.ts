import { RefreshTokenRepository } from './refresh-token.repository.js';
import type { PrismaService } from '@Prisma/services';

function setup() {
  const refreshToken = {
    updateMany: vi.fn().mockResolvedValue({ count: 3 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 4 }),
  };
  const repository = new RefreshTokenRepository({
    refreshToken,
  } as unknown as PrismaService);
  return { repository, refreshToken };
}

describe('RefreshTokenRepository', () => {
  it('revokeByTokenHash solo toca tokens sin revocar, para ser idempotente', async () => {
    const { repository, refreshToken } = setup();

    await expect(repository.revokeByTokenHash('h')).resolves.toBe(3);

    const args = refreshToken.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ tokenHash: 'h', revokedAt: null });
    expect(args.data.revokedAt).toBeInstanceOf(Date);
  });

  it('revokeAllForUser no cambia la fecha de los ya revocados', async () => {
    const { repository, refreshToken } = setup();

    await expect(repository.revokeAllForUser('u1')).resolves.toBe(3);

    expect(refreshToken.updateMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      revokedAt: null,
    });
  });

  it('deleteExpired borra solo los vencidos antes de la fecha indicada', async () => {
    const { repository, refreshToken } = setup();
    const now = new Date('2026-11-08T12:00:00Z');

    await expect(repository.deleteExpired(now)).resolves.toBe(4);

    expect(refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: now } },
    });
  });
});
