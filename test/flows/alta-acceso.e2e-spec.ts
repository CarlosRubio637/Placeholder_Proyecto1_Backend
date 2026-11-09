import type { INestApplication } from '@nestjs/common';
import {
  PASSWORD,
  api,
  createTestApp,
  db,
  inbox,
  resetData,
} from '../support/app.js';

const DOMAIN = 'flujo-alta.test';

/** Flujo H39 → H38 → H31: de un código de unidad a una sesión funcionando. */
describe('Flujo de alta y acceso (H39, H38, H31)', () => {
  let app: INestApplication;
  let unitCode: string;

  const register = (name: string, change: object = {}) =>
    api(app)
      .post('auth/registro')
      .send({
        fullName: `Vecina ${name}`,
        email: `${name}@${DOMAIN}`,
        phone: '7000-1234',
        unitCode,
        password: PASSWORD,
        ...change,
      });

  const loginAs = (name: string, password = PASSWORD) =>
    api(app)
      .post('auth/login')
      .send({ email: `${name}@${DOMAIN}`, password });

  beforeAll(async () => {
    app = await createTestApp();
    await resetData(app);
    const unit = await db(app).unit.findUniqueOrThrow({
      where: { code: 'A-103' },
    });
    unitCode = unit.registrationCode;
  });

  afterAll(async () => {
    // Estos residentes alterarían las audiencias de los demás flujos.
    await resetData(app);
    const where = { email: { endsWith: `@${DOMAIN}` } };
    await db(app).profile.deleteMany({ where: { user: where } });
    await db(app).user.deleteMany({ where });
    await app.close();
  });

  it('el residente se registra con el código y queda en su unidad', async () => {
    const { body } = await register('ana').expect(201);
    expect(body).toMatchObject({
      email: `ana@${DOMAIN}`,
      role: 'RESIDENTE',
      unit: { code: 'A-103' },
    });
    expect(body).not.toHaveProperty('passwordHash');
  });

  it('inicia sesión y /auth/me devuelve su rol, nombre y unidad', async () => {
    const { body } = await loginAs('ana').expect(200);
    const me = await api(app, body.accessToken).get('auth/me').expect(200);
    expect(me.body).toMatchObject({
      role: 'RESIDENTE',
      fullName: 'Vecina ana',
      unit: { code: 'A-103' },
    });
  });

  it('recién registrado, su bandeja está vacía', async () => {
    const { body } = await loginAs('ana').expect(200);
    await expect(inbox(app, body.accessToken)).resolves.toEqual([]);
  });

  it('nadie puede registrarse eligiendo su rol (400)', async () => {
    const { body } = await register('hacker', {
      role: 'ADMINISTRADOR',
    }).expect(400);
    expect(body).toMatchObject({ field: 'role' });
  });

  it('código inexistente: 404', async () => {
    const { body } = await register('sincodigo', {
      unitCode: 'ZZZZ2222',
    }).expect(404);
    expect(body.message).toBe('El código de unidad no existe.');
  });

  it('correo repetido, aunque cambie mayúsculas: 409', async () => {
    const { body } = await register('otra', {
      email: `ANA@${DOMAIN.toUpperCase()}`,
    }).expect(409);
    expect(body.message).toBe('Ya existe una cuenta con ese correo.');
  });

  it('el quinto residente de la unidad: 409', async () => {
    for (const name of ['bea', 'carla', 'dina']) {
      await register(name).expect(201);
    }
    const { body } = await register('elena').expect(409);
    expect(body.message).toBe('La unidad ya tiene 4 residentes registrados.');
  });

  it('contraseña incorrecta y correo inexistente responden igual', async () => {
    const wrong = await loginAs('ana', 'Incorrecta123').expect(401);
    const unknown = await loginAs('nadie').expect(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  describe('sesión', () => {
    it('el refresh rota el token y reusar el viejo cierra las sesiones', async () => {
      const first = await loginAs('ana').expect(200);
      const second = await api(app)
        .post('auth/refresh')
        .send({ refreshToken: first.body.refreshToken })
        .expect(200);
      await api(app, second.body.accessToken).get('auth/me').expect(200);

      await api(app)
        .post('auth/refresh')
        .send({ refreshToken: first.body.refreshToken })
        .expect(401);
      await api(app)
        .post('auth/refresh')
        .send({ refreshToken: second.body.refreshToken })
        .expect(401);
    });

    it('el logout invalida el refresh token', async () => {
      const { body } = await loginAs('bea').expect(200);
      await api(app)
        .post('auth/logout')
        .send({ refreshToken: body.refreshToken })
        .expect(204);
      await api(app)
        .post('auth/refresh')
        .send({ refreshToken: body.refreshToken })
        .expect(401);
    });

    it('al desactivar la cuenta deja de funcionar aunque el token siga vigente', async () => {
      const { body } = await loginAs('carla').expect(200);
      await db(app).user.update({
        where: { email: `carla@${DOMAIN}` },
        data: { isActive: false },
      });

      await api(app, body.accessToken).get('auth/me').expect(401);
      await loginAs('carla').expect(401);
    });
  });
});
