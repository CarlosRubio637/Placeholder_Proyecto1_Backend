import type { INestApplication } from '@nestjs/common';
import { addDays, todayIso } from '../../src/common/time/index.js';
import { condominiumInstant } from '../../src/visits/visits.utils.js';
import { api, createTestApp, db, login, resetData } from '../support/app.js';

const TODAY = todayIso();
const at = (time: string) => condominiumInstant(TODAY, time);

type Row = {
  id: string;
  visitorName: string;
  documentType: string;
  documentNumber: string;
  unitCode: string;
  reason: string;
  entryAt: string;
  minutesInside: number;
};

/** Flujo H14 → H16 → H18: seguridad consulta quién está dentro del condominio. */
describe('Flujo de portería: quién está dentro (H14, H16, H18)', () => {
  let app: INestApplication;
  let residente1: string; // A-101
  let residente4: string; // B-101
  let seguridad: string;
  const ids: Record<string, string> = {};

  const inside = (query = '') =>
    api(app, seguridad).get(`seguridad/visitas/dentro${query}`);

  /** Autoriza una visita (H14) y registra su entrada (H16) a la hora dada. */
  const enterAt = async (
    token: string,
    time: string,
    visitor: {
      visitorName: string;
      documentType: string;
      documentNumber: string;
    },
    reason: string,
  ) => {
    const { body } = await api(app, token)
      .post('visitas')
      .send({
        ...visitor,
        visitDate: TODAY,
        expectedTime: '15:30',
        reason,
      })
      .expect(201);
    vi.setSystemTime(at(time));
    await api(app, seguridad)
      .post(`seguridad/visitas/${body.id}/entrada`)
      .expect(200);
    return body.id as string;
  };

  beforeAll(async () => {
    // Las autorizaciones valen de 06:00 a 22:00: el flujo corre a las 10:00.
    vi.useFakeTimers({ toFake: ['Date'], now: at('10:00') });
    app = await createTestApp();
    await resetData(app);
    [residente1, residente4, seguridad] = await Promise.all([
      login(app, 'residente1'),
      login(app, 'residente4'),
      login(app, 'seguridad1'),
    ]);
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });

  it('sin nadie dentro, la lista está vacía', async () => {
    const { body } = await inside().expect(200);
    expect(body).toEqual({
      totalInside: 0,
      data: [],
      total: 0,
      page: 1,
      pageSize: 50,
    });
  });

  describe('con visitantes dentro', () => {
    beforeAll(async () => {
      ids.laura = await enterAt(
        residente4,
        '10:01',
        {
          visitorName: 'Laura Méndez',
          documentType: 'DUI',
          documentNumber: '04512398-7',
        },
        'Visita familiar',
      );
      ids.pedro = await enterAt(
        residente1,
        '10:02',
        {
          visitorName: 'Pedro Gómez',
          documentType: 'PASAPORTE',
          documentNumber: 'c1112223',
        },
        'Cena familiar',
      );
      ids.roberto = await enterAt(
        residente1,
        '10:03',
        {
          visitorName: 'Roberto Castillo',
          documentType: 'DUI',
          documentNumber: '03984512-1',
        },
        'Entrega de documentos',
      );
      // Una visita que ya salió no cuenta.
      const left = await enterAt(
        residente4,
        '10:03',
        {
          visitorName: 'Marta Ruiz',
          documentType: 'DUI',
          documentNumber: '11111111-1',
        },
        'Mantenimiento',
      );
      await db(app).visit.update({
        where: { id: left },
        data: { status: 'FINALIZADA', exitAt: at('10:04') },
      });
      vi.setSystemTime(at('10:05'));
    });

    it('lista solo las visitas Dentro, la entrada más antigua primero, con el tiempo dentro', async () => {
      const { body } = await inside().expect(200);
      expect(body).toMatchObject({
        totalInside: 3,
        total: 3,
        page: 1,
        pageSize: 50,
      });

      const rows = body.data as Row[];
      expect(rows.map((row) => row.id)).toEqual([
        ids.laura,
        ids.pedro,
        ids.roberto,
      ]);
      expect(rows[0]).toEqual({
        id: ids.laura,
        visitorName: 'Laura Méndez',
        documentType: 'DUI',
        documentNumber: '04512398-7',
        unitCode: 'B-101',
        reason: 'Visita familiar',
        entryAt: at('10:01').toISOString(),
        minutesInside: 4,
      });
      expect(rows.map((row) => row.minutesInside)).toEqual([4, 3, 2]);
    });

    it('busca por nombre sin distinguir mayúsculas ni tildes', async () => {
      const { body } = await inside('?search=MENDEZ').expect(200);
      expect(body.data.map((row: Row) => row.id)).toEqual([ids.laura]);
      // El total del condominio no cambia con el filtro.
      expect(body).toMatchObject({ totalInside: 3, total: 1 });
    });

    it('busca por parte del documento, también de pasaportes', async () => {
      const dui = await inside('?search=03984').expect(200);
      expect(dui.body.data.map((row: Row) => row.id)).toEqual([ids.roberto]);

      const passport = await inside('?search=c111').expect(200);
      expect(passport.body.data[0]).toMatchObject({
        id: ids.pedro,
        documentNumber: 'C1112223',
      });
    });

    it('filtra por torre', async () => {
      const towerB = await db(app).tower.findUniqueOrThrow({
        where: { letter: 'B' },
      });
      const { body } = await inside(`?towerId=${towerB.id}`).expect(200);
      expect(body.data.map((row: Row) => row.unitCode)).toEqual(['B-101']);
      expect(body).toMatchObject({ totalInside: 3, total: 1 });
    });

    it('pagina con pageSize', async () => {
      const { body } = await inside('?page=2&pageSize=2').expect(200);
      expect(body.data.map((row: Row) => row.id)).toEqual([ids.roberto]);
      expect(body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    });

    it('una visita de un día anterior sin salida sigue en la lista', async () => {
      await db(app).visit.update({
        where: { id: ids.laura },
        data: {
          visitDate: new Date(`${addDays(TODAY, -1)}T00:00:00.000Z`),
          entryAt: condominiumInstant(addDays(TODAY, -1), '21:00'),
        },
      });

      const { body } = await inside().expect(200);
      expect(body.data[0]).toMatchObject({
        id: ids.laura,
        // De ayer a las 21:00 a hoy a las 10:05: 13 h 05 min.
        minutesInside: 13 * 60 + 5,
      });
      expect(body.totalInside).toBe(3);
    });
  });

  it.each<[string, string, string]>([
    ['una torre que no es uuid', '?towerId=abc', 'towerId'],
    [
      'una búsqueda de más de 80 caracteres',
      `?search=${'a'.repeat(81)}`,
      'search',
    ],
    ['una página inválida', '?page=0', 'page'],
    ['un tamaño de página de más de 100', '?pageSize=101', 'pageSize'],
  ])('rechaza %s con 400 y el campo', async (_caso, query, field) => {
    const { body } = await inside(query).expect(400);
    expect(body).toMatchObject({ statusCode: 400, field });
  });
});
