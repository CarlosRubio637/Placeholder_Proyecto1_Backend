import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, login } from './support/app.js';

describe('Arranque de la API', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('usa la misma configuración que producción: prefijo /api/v1', async () => {
    await api(app).get('').expect(200).expect('Hello World!');
  });

  it('el guard global exige sesión', async () => {
    await api(app).get('auth/me').expect(401);
  });

  it('el seed está cargado y las cuentas de prueba inician sesión', async () => {
    const token = await login(app, 'admin');
    const { body } = await api(app, token).get('auth/me').expect(200);
    expect(body).toMatchObject({ role: 'ADMINISTRADOR', unit: null });
  });

  it('la validación global rechaza campos que no están en el contrato', async () => {
    const { body } = await api(app)
      .post('auth/login')
      .send({
        email: 'a@condominio.test',
        password: 'x',
        role: 'ADMINISTRADOR',
      })
      .expect(400);
    expect(body).toMatchObject({ statusCode: 400, field: 'role' });
  });
});
