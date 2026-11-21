import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, login, resetData } from '../support/app.js';

/** Flujo H28: el residente decide qué datos muestra en el directorio. */
describe('Flujo de perfil y privacidad (H28)', () => {
  let app: INestApplication;
  let residente3: string; // A-102
  let residente4: string; // B-101

  const PRIVATE = {
    visible: false,
    showName: false,
    showUnit: false,
    showPhone: false,
    showEmail: false,
  };
  const save = (change: object = {}) =>
    api(app, residente3)
      .put('perfil')
      .send({ phone: '7777-1234', directory: PRIVATE, ...change });

  beforeAll(async () => {
    app = await createTestApp();
    await resetData(app);
    [residente3, residente4] = await Promise.all([
      login(app, 'residente3'),
      login(app, 'residente4'),
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('sin preferencias guardadas, todo es privado', async () => {
    const { body } = await api(app, residente3).get('perfil').expect(200);
    expect(body).toMatchObject({
      email: 'residente3@condominio.test',
      unitCode: 'A-102',
      directory: PRIVATE,
    });
    expect(body.fullName).toEqual(expect.any(String));
  });

  it.each<[string, object, string]>([
    ['un teléfono mal formado', { phone: '777' }, 'phone'],
    ['preferencias ausentes', { directory: undefined }, 'directory'],
    [
      'una preferencia que no es booleana',
      { directory: { ...PRIVATE, showUnit: 'sí' } },
      'directory.showUnit',
    ],
    [
      'campos que no se pueden cambiar',
      { fullName: 'Otro Nombre' },
      'fullName',
    ],
  ])('rechaza %s (400)', async (_caso, change, field) => {
    const { body } = await save(change).expect(400);
    expect(body).toMatchObject({ field });
  });

  it('para aparecer en el directorio hay que mostrar el nombre', async () => {
    const { body } = await save({
      directory: { ...PRIVATE, visible: true },
    }).expect(400);
    expect(body).toMatchObject({
      field: 'directory.showName',
      message: ['Para aparecer en el directorio debes mostrar tu nombre.'],
    });
  });

  it('guarda teléfono y preferencias, y persisten', async () => {
    const directory = { ...PRIVATE, visible: true, showName: true };
    await save({ directory }).expect(200);

    const { body } = await api(app, residente3).get('perfil').expect(200);
    expect(body).toMatchObject({ phone: '7777-1234', directory });
  });

  it('guardar otra vez actualiza sin duplicar', async () => {
    await save({ phone: '7777-9999' }).expect(200);
    const { body } = await api(app, residente3).get('perfil').expect(200);
    expect(body).toMatchObject({ phone: '7777-9999', directory: PRIVATE });
  });

  it('no afecta a otros residentes', async () => {
    const { body } = await api(app, residente4).get('perfil').expect(200);
    expect(body.unitCode).toBe('B-101');
    expect(body.phone).not.toBe('7777-9999');
    expect(body.directory).toEqual(PRIVATE);
  });
});
