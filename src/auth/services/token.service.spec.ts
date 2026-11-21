import { createHash } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service.js';
import type { RefreshTokenRepository } from '@Auth/repositories';
import type { AccessTokenPayload } from '@Auth/types';
import type { EnvConfig } from '@Config';
import type { User } from '@PrismaClient';

const DAY_MS = 24 * 60 * 60 * 1000;
const TTL_DAYS = 7;

const user = {
  id: 'u1',
  email: 'residente1@condominio.test',
  role: 'RESIDENTE',
  isActive: true,
  passwordHash: 'hash-real',
} as User;

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

/** Fila vigente; cada prueba cambia solo lo que le interesa. */
const storedRow = (change: object = {}) => ({
  id: 'rt-1',
  userId: 'u1',
  revokedAt: null,
  expiresAt: new Date(Date.now() + DAY_MS),
  user,
  ...change,
});

function setup() {
  const repository = {
    create: vi.fn().mockResolvedValue({}),
    findByTokenHashWithUser: vi.fn().mockResolvedValue(storedRow()),
    revokeById: vi.fn().mockResolvedValue(1),
    revokeByTokenHash: vi.fn().mockResolvedValue(1),
    revokeAllForUser: vi.fn().mockResolvedValue(2),
  };
  // JwtService real: así se prueba el token que de verdad se firma.
  const jwt = new JwtService({
    secret: 'secreto-de-prueba',
    signOptions: { expiresIn: '15m' },
  });
  const config = { get: vi.fn().mockReturnValue(TTL_DAYS) };
  const service = new TokenService(
    repository as unknown as RefreshTokenRepository,
    jwt,
    config as unknown as ConfigService<EnvConfig, true>,
  );
  return { service, repository, jwt, config };
}

describe('TokenService.issueTokenPair', () => {
  it('firma un access token con id, correo y rol, sin datos sensibles', async () => {
    const { service, jwt } = setup();

    const { accessToken } = await service.issueTokenPair(user);

    const payload = await jwt.verifyAsync<AccessTokenPayload>(accessToken);
    expect(payload).toMatchObject({
      sub: 'u1',
      email: user.email,
      role: 'RESIDENTE',
    });
    expect(payload).not.toHaveProperty('passwordHash');
  });

  it('expiresIn sale de la vigencia real del token firmado', async () => {
    const { service } = setup();
    await expect(service.issueTokenPair(user)).resolves.toMatchObject({
      expiresIn: 15 * 60,
    });
  });

  it('guarda solo el SHA-256 del refresh token, nunca el valor en claro', async () => {
    const { service, repository } = setup();

    const { refreshToken } = await service.issueTokenPair(user);

    expect(refreshToken).toMatch(/^[0-9a-f]{64}$/);
    const data = repository.create.mock.calls[0][0];
    expect(data.userId).toBe('u1');
    expect(data.tokenHash).toBe(sha256(refreshToken));
    expect(data.tokenHash).not.toBe(refreshToken);
  });

  it('el refresh token vence a los días configurados', async () => {
    const { service, repository, config } = setup();
    const before = Date.now();

    await service.issueTokenPair(user);

    expect(config.get.mock.calls[0][0]).toBe('REFRESH_TOKEN_EXPIRES_IN_DAYS');
    const expiresAt: Date = repository.create.mock.calls[0][0].expiresAt;
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + TTL_DAYS * DAY_MS,
    );
    expect(expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + TTL_DAYS * DAY_MS,
    );
  });

  it('cada emisión genera un refresh token distinto', async () => {
    const { service } = setup();
    const first = await service.issueTokenPair(user);
    const second = await service.issueTokenPair(user);
    expect(first.refreshToken).not.toBe(second.refreshToken);
  });
});

describe('TokenService.rotate', () => {
  it('busca por hash, revoca el token usado y entrega un par nuevo', async () => {
    const { service, repository } = setup();

    const result = await service.rotate('token-viejo');

    expect(repository.findByTokenHashWithUser).toHaveBeenCalledWith(
      sha256('token-viejo'),
    );
    expect(repository.revokeById).toHaveBeenCalledWith('rt-1');
    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(result.user).toBe(user);
    expect(result.tokens.refreshToken).not.toBe('token-viejo');
  });

  it('401 si el token no existe, sin revocar nada', async () => {
    const { service, repository } = setup();
    repository.findByTokenHashWithUser.mockResolvedValue(null);

    const error = await service.rotate('x').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as Error).message).toBe('Refresh token inválido.');
    expect(repository.revokeAllForUser).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('reúso: un token ya canjeado cierra todas las sesiones del usuario', async () => {
    const { service, repository } = setup();
    repository.findByTokenHashWithUser.mockResolvedValue(
      storedRow({ revokedAt: new Date() }),
    );

    await expect(service.rotate('robado')).rejects.toThrow(
      'Refresh token ya utilizado. Se cerraron todas las sesiones por seguridad.',
    );
    expect(repository.revokeAllForUser).toHaveBeenCalledWith('u1');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it.each<[string, object, string]>([
    [
      'vencido',
      { expiresAt: new Date(Date.now() - 1000) },
      'Refresh token expirado.',
    ],
    [
      'de una cuenta inactiva',
      { user: { ...user, isActive: false } },
      'La cuenta está inactiva.',
    ],
  ])(
    '401 si el token es %s y no emite otro',
    async (_caso, change, message) => {
      const { service, repository } = setup();
      repository.findByTokenHashWithUser.mockResolvedValue(storedRow(change));

      const error = await service.rotate('x').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as Error).message).toBe(message);
      expect(repository.revokeById).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
    },
  );
});

describe('TokenService: revocación', () => {
  it('revoke usa el hash y no falla si el token no existía (logout idempotente)', async () => {
    const { service, repository } = setup();
    repository.revokeByTokenHash.mockResolvedValue(0);

    await expect(service.revoke('token')).resolves.toBeUndefined();

    expect(repository.revokeByTokenHash).toHaveBeenCalledWith(sha256('token'));
  });

  it('revokeAllForUser cierra todas las sesiones', async () => {
    const { service, repository } = setup();
    await expect(service.revokeAllForUser('u1')).resolves.toBeUndefined();
    expect(repository.revokeAllForUser).toHaveBeenCalledWith('u1');
  });
});
