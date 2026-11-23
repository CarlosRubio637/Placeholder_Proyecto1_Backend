import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { validationExceptionFactory } from '@Common/validation';
import { CreateIncidentDto } from './create-incident.dto.js';

// El mismo ValidationPipe global de app.setup.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: validationExceptionFactory,
});

const valid = {
  title: 'Fuga de agua',
  description: 'Gotea agua del techo del pasillo.',
  location: 'TORRE_A',
  locationDetail: 'Piso 3, pasillo norte',
};

function parse(body: object) {
  return pipe.transform(body, { type: 'body', metatype: CreateIncidentDto });
}

/** Respuesta 400 del pipe: { field, message[] }. */
async function rejection(body: object) {
  const error = await parse(body).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(BadRequestException);
  return (error as BadRequestException).getResponse() as {
    field: string;
    message: string[];
  };
}

describe('H10. Registro de incidencia con evidencia', () => {
  it('AC5: acepta un reporte válido y limpia los espacios', async () => {
    await expect(
      parse({ ...valid, title: '  Fuga de agua  ', locationDetail: '' }),
    ).resolves.toMatchObject({
      title: 'Fuga de agua',
      locationDetail: undefined,
    });
  });

  it.each<[string, object, string, string]>([
    [
      'sin título',
      { ...valid, title: undefined },
      'title',
      'El título debe tener entre 5 y 80 caracteres.',
    ],
    [
      'un título de 4 caracteres',
      { ...valid, title: 'Fuga' },
      'title',
      'El título debe tener entre 5 y 80 caracteres.',
    ],
    [
      'un título de 81 caracteres',
      { ...valid, title: 'x'.repeat(81) },
      'title',
      'El título debe tener entre 5 y 80 caracteres.',
    ],
    [
      'sin descripción',
      { ...valid, description: undefined },
      'description',
      'La descripción debe tener entre 10 y 1,000 caracteres.',
    ],
    [
      'una descripción de 9 caracteres',
      { ...valid, description: 'x'.repeat(9) },
      'description',
      'La descripción debe tener entre 10 y 1,000 caracteres.',
    ],
    [
      'una descripción de 1,001 caracteres',
      { ...valid, description: 'x'.repeat(1001) },
      'description',
      'La descripción debe tener entre 10 y 1,000 caracteres.',
    ],
    [
      'sin ubicación',
      { ...valid, location: undefined },
      'location',
      'Selecciona una ubicación.',
    ],
    [
      'una ubicación fuera de la lista',
      { ...valid, location: 'AZOTEA' },
      'location',
      'Selecciona una ubicación.',
    ],
    [
      'una referencia de 101 caracteres',
      { ...valid, locationDetail: 'x'.repeat(101) },
      'locationDetail',
      'La referencia de la ubicación no puede superar los 100 caracteres.',
    ],
  ])(
    'AC5: rechaza %s con 400 y el campo que falló',
    async (_caso, body, field, message) => {
      await expect(rejection(body)).resolves.toMatchObject({
        field,
        message: expect.arrayContaining([message]) as unknown,
      });
    },
  );

  it('AC5: acepta los límites exactos de 5, 80, 10, 1,000 y 100 caracteres', async () => {
    for (const body of [
      { ...valid, title: 'x'.repeat(5), description: 'x'.repeat(10) },
      {
        ...valid,
        title: 'x'.repeat(80),
        description: 'x'.repeat(1000),
        locationDetail: 'x'.repeat(100),
      },
    ]) {
      await expect(parse(body)).resolves.toBeInstanceOf(CreateIncidentDto);
    }
  });

  it('AC4: no deja elegir el estado ni la prioridad al crear', async () => {
    expect((await rejection({ ...valid, status: 'RESUELTO' })).field).toBe(
      'status',
    );
    expect((await rejection({ ...valid, priority: 'ALTA' })).field).toBe(
      'priority',
    );
  });
});
