import { ValidateBy, type ValidationOptions } from 'class-validator';

export function CodePointLength(
  min: number,
  max: number,
  options?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'codePointLength',
      constraints: [min, max],
      validator: {
        validate: (value: unknown) => {
          if (typeof value !== 'string') return false;
          const length = Array.from(value).length;
          return length >= min && length <= max;
        },
      },
    },
    options,
  );
}
