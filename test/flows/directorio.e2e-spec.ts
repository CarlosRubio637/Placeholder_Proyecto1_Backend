import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, db, login, resetData } from '../support/app.js';

type Prefs = {
  visible: boolean;
  showName: boolean;
  showUnit: boolean;
  showPhone: boolean;
  showEmail: boolean;
};

type Entry = {
  fullName: string;
  unitCode?: string;
  phone?: string;
  email?: string;
};

const HIDDEN: Prefs = {
  visible: false,
  showName: false,
  showUnit: false,
  showPhone: false,
  showEmail: false,
};

describe('H29. Búsqueda de contacto de vecinos', () => {
  let app: INestApplication;
  let residente5: string;
  let towerA: string;
  let towerB: string;
  const phones = new Map<string, string>();

  const share = async (account: string, prefs: Partial<Prefs>) => {
    const token = await login(app, account);
    const { body } = await api(app, token).get('perfil').expect(200);
    const phone = (body as { phone: string }).phone;
    phones.set(account, phone);
    await api(app, token)
      .put('perfil')
      .send({ phone, directory: { ...HIDDEN, ...prefs } })
      .expect(200);
  };

  const search = async (query: string, token = residente5) => {
    const { body } = await api(app, token)
      .get(`directorio?${query}`)
      .expect(200);
    return body as { data: Entry[]; total: number; pageSize: number };
  };

  beforeAll(async () => {
    app = await createTestApp();
    await resetData(app);
    const visible = { visible: true, showName: true };
    await share('residente1', {
      ...visible,
      showUnit: true,
      showPhone: true,
      showEmail: true,
    });
    await share('residente2', { ...visible, showPhone: true });
    await share('residente3', HIDDEN);
    await share('residente4', { ...visible, showEmail: true });
    await share('residente5', { ...visible, showUnit: true });
    residente5 = await login(app, 'residente5');
    const towers = await db(app).tower.findMany({
      where: { letter: { in: ['A', 'B'] } },
      orderBy: { letter: 'asc' },
    });
    [towerA, towerB] = towers.map((tower) => tower.id);
  });

  afterAll(async () => {
    await app.close();
  });

  it('AC4: por nombre trae solo a los visibles y solo con los campos que comparten', async () => {
    const { data, total, pageSize } = await search('name=GOMEZ');
    expect(data).toEqual([
      {
        fullName: 'Ana Gómez',
        unitCode: 'A-101',
        phone: phones.get('residente1'),
        email: 'residente1@condominio.test',
      },
      { fullName: 'Luis Gómez', phone: phones.get('residente2') },
    ]);
    expect({ total, pageSize }).toEqual({ total: 2, pageSize: 20 });
    await expect(search('name=flores')).resolves.toMatchObject({ total: 0 });
    await expect(search('name=ramos')).resolves.toMatchObject({ total: 0 });
  });

  it('AC5: quien oculta su unidad no aparece al buscar esa unidad, aunque sí por nombre', async () => {
    await expect(
      search(`towerId=${towerB}&unitNumber=101`),
    ).resolves.toMatchObject({ total: 0, data: [] });
    const { data } = await search('name=díaz');
    expect(data).toEqual([
      { fullName: 'Roberto Díaz', email: 'residente4@condominio.test' },
    ]);
  });

  it('AC5: por unidad trae solo a quien la muestra', async () => {
    const { data } = await search(`towerId=${towerA}&unitNumber=101`);
    expect(data.map((entry) => entry.fullName)).toEqual(['Ana Gómez']);
  });

  it('AC6: el propio residente no aparece en sus resultados', async () => {
    await expect(search('name=castillo')).resolves.toMatchObject({
      total: 0,
    });
  });

  it('AC6: rechaza un nombre de 2 caracteres y más de 20 por página, y no hay exportación', async () => {
    const short = await api(app, residente5)
      .get('directorio?name=go')
      .expect(400);
    expect(short.body).toMatchObject({
      field: 'name',
      message: ['Escribe al menos 3 caracteres del nombre.'],
    });
    await api(app, residente5)
      .get('directorio?name=gomez&pageSize=21')
      .expect(400);
    await api(app, residente5).get('directorio/exportar').expect(404);
  });

  it('AC6: los comodines "%%%" y "___" no listan todo el directorio', async () => {
    await expect(search('name=%25%25%25')).resolves.toMatchObject({
      total: 0,
    });
    await expect(search('name=___')).resolves.toMatchObject({ total: 0 });
  });

  it('AC6: "^^^" no cuenta como 3 letras y responde 400', async () => {
    const { body } = await api(app, residente5)
      .get('directorio?name=%5E%5E%5E')
      .expect(400);
    expect(body).toMatchObject({
      field: 'name',
      message: ['Escribe al menos 3 caracteres del nombre.'],
    });
  });

  it.each(['admin', 'seguridad1'])(
    'AC7: %s recibe 403 en el directorio',
    async (account) => {
      const token = await login(app, account);
      await api(app, token).get('directorio?name=gomez').expect(403);
    },
  );
});
