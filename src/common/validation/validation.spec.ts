import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { badRequest } from './bad-request.js';
import { validationExceptionFactory } from './validation-exception.factory.js';

const failure = (
  property: string,
  constraints?: Record<string, string>,
  children: ValidationError[] = [],
): ValidationError => ({ property, constraints, children });

const bodyOf = (errors: ValidationError[]) => {
  const exception = validationExceptionFactory(errors);
  expect(exception).toBeInstanceOf(BadRequestException);
  return exception.getResponse();
};

describe('validationExceptionFactory', () => {
  it('mantiene la forma de Nest y agrega el campo que falló', () => {
    expect(
      bodyOf([failure('title', { minLength: 'Título muy corto.' })]),
    ).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: ['Título muy corto.'],
      field: 'title',
    });
  });

  it('field es el primer campo y message trae los errores de todos', () => {
    expect(
      bodyOf([
        failure('title', { minLength: 'Título corto.' }),
        failure('endsAt', { isDate: 'Fecha inválida.' }),
      ]),
    ).toMatchObject({
      field: 'title',
      message: ['Título corto.', 'Fecha inválida.'],
    });
  });

  it('arma la ruta completa de los errores anidados', () => {
    const errors = [
      failure('topics', undefined, [
        failure('0', undefined, [
          failure('options', { arrayMinSize: 'Faltan opciones.' }),
        ]),
      ]),
    ];
    expect(bodyOf(errors)).toMatchObject({
      field: 'topics.0.options',
      message: ['Faltan opciones.'],
    });
  });

  it('incluye errores del padre y de sus hijos', () => {
    const errors = [
      failure('topics', { arrayMaxSize: 'Demasiados temas.' }, [
        failure('0', undefined, [
          failure('question', { minLength: 'Pregunta corta.' }),
        ]),
      ]),
    ];
    expect(bodyOf(errors)).toMatchObject({
      field: 'topics',
      message: ['Demasiados temas.', 'Pregunta corta.'],
    });
  });

  it('no repite un mensaje cuando varias reglas fallan igual', () => {
    expect(
      bodyOf([
        failure('title', {
          isString: 'El título es obligatorio.',
          minLength: 'El título es obligatorio.',
        }),
      ]),
    ).toMatchObject({ message: ['El título es obligatorio.'] });
  });
});

describe('badRequest', () => {
  it('produce la misma forma que el ValidationPipe, con message como lista', () => {
    const exception = badRequest('startsAt', 'Fecha inválida.');

    expect(exception).toBeInstanceOf(BadRequestException);
    expect(exception.getStatus()).toBe(400);
    expect(exception.getResponse()).toEqual(
      bodyOf([failure('startsAt', { isDate: 'Fecha inválida.' })]),
    );
  });
});
