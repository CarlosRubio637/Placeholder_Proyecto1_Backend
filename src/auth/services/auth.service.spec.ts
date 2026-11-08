import { UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { AuthService } from './auth.service.js';
import type { TokenService } from './token.service.js';
import type { UsersService } from '@Users/services';
import type { User } from '@PrismaClient';

vi.mock('bcrypt', () => ({
  default: { compare: vi.fn().mockResolvedValue(false) },
}));

const user = {
  id: 'u1',
  email: 'residente1@condominio.test',
  passwordHash: 'hash-real',
  isActive: true,
} as User;
const tokens = { accessToken: 'a', refreshToken: 'r', expiresIn: 900 };

function setup() {
  const usersService = {
    findByEmail: vi.fn().mockResolvedValue(user),
    verifyPassword: vi.fn().mockResolvedValue(true),
  };
  const tokenService = {
    issueTokenPair: vi.fn().mockResolvedValue(tokens),
    rotate: vi.fn().mockResolvedValue({ user, tokens }),
    revoke: vi.fn().mockResolvedValue(undefined),
  };
  const service = new AuthService(
    usersService as unknown as UsersService,
    tokenService as unknown as TokenService,
  );
  return { service, usersService, tokenService };
}

const CREDENTIALS = { email: user.email, password: 'Prueba2026' };

describe('AuthService.login', () => {
  beforeEach(() => vi.mocked(bcrypt.compare).mockClear());

  it('con credenciales correctas devuelve el usuario y emite sus tokens', async () => {
    const { service, usersService, tokenService } = setup();

    await expect(service.login(CREDENTIALS)).resolves.toEqual({ user, tokens });

    expect(usersService.verifyPassword).toHaveBeenCalledWith(
      'Prueba2026',
      'hash-real',
    );
    expect(tokenService.issueTokenPair).toHaveBeenCalledWith(user);
  });

  // Los tres casos deben ser indistinguibles para no revelar qué correos existen.
  it.each<[string, (ctx: ReturnType<typeof setup>) => void]>([
    [
      'correo no registrado',
      ({ usersService }) => usersService.findByEmail.mockResolvedValue(null),
    ],
    [
      'contraseña incorrecta',
      ({ usersService }) =>
        usersService.verifyPassword.mockResolvedValue(false),
    ],
    [
      'cuenta inactiva',
      ({ usersService }) =>
        usersService.findByEmail.mockResolvedValue({
          ...user,
          isActive: false,
        }),
    ],
  ])('%s: mismo 401 genérico y sin tokens', async (_caso, arrange) => {
    const ctx = setup();
    arrange(ctx);

    const error = await ctx.service.login(CREDENTIALS).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).message).toBe(
      'Credenciales inválidas.',
    );
    expect(ctx.tokenService.issueTokenPair).not.toHaveBeenCalled();
  });

  it('si el correo no existe igual ejecuta bcrypt, con costo 12, para no filtrar por tiempo', async () => {
    const { service, usersService } = setup();
    usersService.findByEmail.mockResolvedValue(null);

    await service.login(CREDENTIALS).catch(() => undefined);

    expect(bcrypt.compare).toHaveBeenCalledTimes(1);
    const [password, hash] = vi.mocked(bcrypt.compare).mock.calls[0];
    expect(password).toBe('Prueba2026');
    // Un hash mal formado haría que bcrypt responda al instante.
    expect(hash).toMatch(/^\$2b\$12\$[./A-Za-z0-9]{53}$/);
    expect(usersService.verifyPassword).not.toHaveBeenCalled();
  });

  it('una cuenta inactiva también pasa por la verificación de contraseña', async () => {
    const { service, usersService } = setup();
    usersService.findByEmail.mockResolvedValue({ ...user, isActive: false });

    await service.login(CREDENTIALS).catch(() => undefined);

    expect(usersService.verifyPassword).toHaveBeenCalledTimes(1);
  });
});

describe('AuthService: refresh y logout', () => {
  it('refresh delega en la rotación del token', async () => {
    const { service, tokenService } = setup();
    await expect(service.refresh('viejo')).resolves.toEqual({ user, tokens });
    expect(tokenService.rotate).toHaveBeenCalledWith('viejo');
  });

  it('logout revoca el token', async () => {
    const { service, tokenService } = setup();
    await expect(service.logout('viejo')).resolves.toBeUndefined();
    expect(tokenService.revoke).toHaveBeenCalledWith('viejo');
  });
});
