import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, login, resetData } from './support/app.js';
import { API_PREFIX } from '../src/app.setup.js';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type RoleName = 'RESIDENTE' | 'SEGURIDAD' | 'ADMINISTRADOR';

const R: RoleName = 'RESIDENTE';
const S: RoleName = 'SEGURIDAD';
const A: RoleName = 'ADMINISTRADOR';
const ALL = [R, S, A];
const PUBLIC = 'PUBLIC';

const ID = '3f2b1c9e-8a4d-4e6f-9b1a-7c5d2e8f0a11';

/**
 * Matriz de permisos: cada endpoint con quién puede entrar. Una historia nueva
 * agrega su fila; si no lo hace, falla la última prueba de este archivo.
 */
const MATRIX: [Method, string, RoleName[] | typeof PUBLIC][] = [
  ['get', '', PUBLIC],
  ['post', 'auth/registro', PUBLIC],
  ['post', 'auth/login', PUBLIC],
  ['post', 'auth/refresh', PUBLIC],
  ['post', 'auth/logout', PUBLIC],
  ['get', 'auth/me', ALL],

  ['get', 'torres', [S, A]],
  ['get', 'unidades', [S, A]],

  ['get', 'notificaciones', ALL],
  ['get', 'notificaciones/no-leidas/conteo', ALL],
  ['patch', 'notificaciones/leidas', ALL],
  ['patch', 'notificaciones/:id/leida', ALL],

  ['post', 'incidencias', [R]],
  ['get', 'incidencias/mias', [R]],
  ['get', 'incidencias/fotos/:fotoId', [R, A]],
  ['get', 'incidencias/:id', [R, A]],

  ['get', 'admin/areas', [A]],
  ['post', 'admin/areas', [A]],
  ['patch', 'admin/areas/:id', [A]],
  ['post', 'admin/areas/:id/bloqueos', [A]],
  ['delete', 'admin/areas/:id/bloqueos/:bloqueoId', [A]],
  ['get', 'areas', [R, A]],
  ['get', 'areas/:areaId/disponibilidad', [R, A]],
  ['post', 'reservas', [R]],

  ['post', 'seguridad/paquetes', [S]],
  ['get', 'seguridad/paquetes', [S]],
  ['get', 'paquetes/mios', [R]],

  ['post', 'admin/asambleas', [A]],
  ['get', 'admin/asambleas', [A]],
  ['get', 'admin/asambleas/:id', [A]],
  ['put', 'admin/asambleas/:id', [A]],
  ['delete', 'admin/asambleas/:id', [A]],
  ['get', 'asambleas/activas', [R]],
  ['get', 'asambleas/:id', [R]],
  ['post', 'asambleas/temas/:temaId/votos', [R]],

  ['get', 'cuotas/generaciones/vista-previa', [A]],
  ['post', 'cuotas/generaciones', [A]],
  ['get', 'cuotas/generaciones', [A]],

  ['get', 'admin/comunicados/audiencia', [A]],
  ['post', 'admin/comunicados', [A]],
  ['get', 'comunicados', [R]],
  ['post', 'comunicados/:id/lectura', [R]],

  ['get', 'perfil', [R]],
  ['put', 'perfil', [R]],

  ['post', 'visitas', [R]],

  ['get', 'admin/reportes/morosidad', [A]],
  ['get', 'admin/reportes/incidencias', [A]],
];

const concrete = (path: string) => path.replace(/:[A-Za-z]+/g, ID);

describe('Matriz de permisos', () => {
  let app: INestApplication;
  let tokens: Record<RoleName, string>;

  beforeAll(async () => {
    app = await createTestApp();
    await resetData(app);
    const [residente, seguridad, admin] = await Promise.all([
      login(app, 'residente1'),
      login(app, 'seguridad1'),
      login(app, 'admin'),
    ]);
    tokens = {
      RESIDENTE: residente,
      SEGURIDAD: seguridad,
      ADMINISTRADOR: admin,
    };
  });

  afterAll(async () => {
    await resetData(app);
    await app.close();
  });

  const protectedRoutes = MATRIX.filter(([, , roles]) => roles !== PUBLIC) as [
    Method,
    string,
    RoleName[],
  ][];

  it.each(protectedRoutes)('%s /%s sin sesión: 401', async (method, path) => {
    await api(app)[method](concrete(path)).expect(401);
  });

  it.each(
    protectedRoutes.flatMap(([method, path, roles]) =>
      ALL.filter((role) => !roles.includes(role)).map(
        (role) => [method, path, role] as const,
      ),
    ),
  )('%s /%s como %s: 403', async (method, path, role) => {
    const { body } = await api(app, tokens[role])
      [method](concrete(path))
      .expect(403);
    expect(body).toMatchObject({
      code: 'FORBIDDEN',
      message: 'No tienes permiso para esta acción.',
    });
  });

  // Con un cuerpo vacío y un id inexistente puede dar 200, 400 o 404: lo que
  // importa aquí es que el guard la deje pasar.
  it.each(
    protectedRoutes.flatMap(([method, path, roles]) =>
      roles.map((role) => [method, path, role] as const),
    ),
  )('%s /%s como %s: entra', async (method, path, role) => {
    const { status } = await api(app, tokens[role])[method](concrete(path));
    expect([401, 403]).not.toContain(status);
    expect(status).toBeLessThan(500);
  });

  it('todos los endpoints de la API están en la matriz', () => {
    type Layer = {
      route?: { path: string; methods: Record<string, boolean> };
    };
    const express = app.getHttpAdapter().getInstance() as {
      router: { stack: Layer[] };
    };
    const prefix = `/${API_PREFIX}`;
    const actual = express.router.stack
      .flatMap((layer) =>
        layer.route
          ? Object.keys(layer.route.methods).map(
              (method) =>
                `${method} ${layer.route?.path.slice(prefix.length + 1)}`,
            )
          : [],
      )
      .sort();
    const expected = MATRIX.map(([method, path]) => `${method} ${path}`).sort();
    expect(actual).toEqual(expected);
  });
});
