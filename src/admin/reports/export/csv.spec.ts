import { renderCsv } from './csv.js';

const text = (buffer: Buffer) => buffer.toString('utf8');

describe('H36. renderCsv', () => {
  it('empieza con el BOM de UTF-8 para que Excel muestre las tildes', () => {
    const csv = renderCsv({ columns: ['Área'], rows: [['Piscina']] });
    expect([...csv.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(text(csv)).toBe('﻿Área\r\nPiscina\r\n');
  });

  it('usa coma como separador, una fila de encabezados y CRLF', () => {
    const csv = renderCsv({
      columns: ['Unidad', 'Monto adeudado ($)', 'Antigüedad (días)'],
      rows: [
        ['A-101', '255.00', 98],
        ['B-202', '30.50', 0],
      ],
    });
    expect(text(csv).slice(1).split('\r\n')).toEqual([
      'Unidad,Monto adeudado ($),Antigüedad (días)',
      'A-101,255.00,98',
      'B-202,30.50,0',
      '',
    ]);
  });

  it('pone entre comillas los valores con coma, comillas o saltos de línea', () => {
    const csv = renderCsv({
      columns: ['Título'],
      rows: [['Fuga, baño'], ['Dice "urgente"'], ['Dos\nlíneas']],
    });
    expect(text(csv).slice(1).split('\r\n')).toEqual([
      'Título',
      '"Fuga, baño"',
      '"Dice ""urgente"""',
      '"Dos\nlíneas"',
      '',
    ]);
  });

  it('deja vacío un valor null', () => {
    const csv = renderCsv({ columns: ['A', 'B'], rows: [[null, 1]] });
    expect(text(csv)).toBe('﻿A,B\r\n,1\r\n');
  });

  it('sin filas trae solo los encabezados', () => {
    const csv = renderCsv({ columns: ['A', 'B'], rows: [] });
    expect(text(csv)).toBe('﻿A,B\r\n');
  });
});
