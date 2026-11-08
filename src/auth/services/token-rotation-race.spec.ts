import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service.js';
import { RefreshTokenRepository } from '../repositories/refresh-token.repository.js';
import type { EnvConfig } from '@Config';
import type { PrismaService } from '@Prisma/services';

const user = {
  id: 'u1',
  email: 'a@condominio.test',
  role: 'RESIDENTE',
  isActive: true,
};

/** TokenService con el repositorio real sobre una tabla simulada de una fila. */
function setup() {
  const row = {
    id: 'rt-1',
    userId: 'u1',
    revokedAt: null as Date | null,
    expiresAt: new Date(Date.now() + 60_000),
    user,
  };
  const refreshToken = {
    // Cada lectura ve la fila vigente, como dos peticiones simultáneas.
    findUnique: vi.fn().mockImplementation(() => Promise.resolve({ ...row })),
    updateMany: vi
      .fn()
      .mockImplementation(
        ({
          where,
          data,
        }: {
          where: { id?: string; revokedAt: null };
          data: { revokedAt: Date };
        }) => {
          if (where.id === undefined) return Promise.resolve({ count: 0 });
          if (row.revokedAt !== null) return Promise.resolve({ count: 0 });
          row.revokedAt = data.revokedAt;
          return Promise.resolve({ count: 1 });
        },
      ),
    create: vi.fn().mockResolvedValue({}),
  };
  const service = new TokenService(
    new RefreshTokenRepository({ refreshToken } as unknown as PrismaService),
    new JwtService({ secret: 'secreto', signOptions: { expiresIn: '15m' } }),
    { get: () => 7 } as unknown as ConfigService<EnvConfig, true>,
  );
  return { service, refreshToken };
}

describe('TokenService.rotate: canjes simultáneos del mismo token', () => {
  it('solo uno obtiene tokens; el otro se trata como reúso y cierra las sesiones', async () => {
    const { service, refreshToken } = setup();

    const results = await Promise.allSettled([
      service.rotate('mismo-token'),
      service.rotate('mismo-token'),
    ]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const reason: unknown = rejected[0].reason;
    expect(reason).toBeInstanceOf(UnauthorizedException);
    expect((reason as Error).message).toBe(
      'Refresh token ya utilizado. Se cerraron todas las sesiones por seguridad.',
    );
    expect(refreshToken.create).toHaveBeenCalledTimes(1);
    expect(refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', revokedAt: null } }),
    );
  });

  it('un canje normal sigue funcionando y condiciona la revocación', async () => {
    const { service, refreshToken } = setup();

    await expect(service.rotate('token')).resolves.toMatchObject({ user });

    expect(refreshToken.updateMany.mock.calls[0][0].where).toEqual({
      id: 'rt-1',
      revokedAt: null,
    });
  });
});
