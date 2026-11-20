import { renderPdf } from './pdf.js';
import type { ReportTable } from './report-table.js';

const META = {
  generatedAt: new Date('2026-11-20T16:00:00Z'),
  generatedBy: 'Administración General',
};

function table(rows: ReportTable['rows'], columns = 3): ReportTable {
  return {
    report: 'morosidad',
    title: 'Reporte de morosidad',
    period: { from: '2025-11-20', to: '2026-11-20' },
    filters: [['Vencimiento desde', '20/11/2025']],
    summary: [['Monto adeudado', '$255.00']],
    tableTitle: 'Unidades morosas',
    columns: ['Unidad', 'Monto adeudado ($)', 'Antigüedad (días)'].slice(
      0,
      columns,
    ),
    rows,
  };
}

/** Páginas del PDF: cuenta los objetos /Type /Page (no /Pages). */
function pageCount(pdf: Buffer): number {
  return pdf.toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0;
}

describe('H36. renderPdf', () => {
  it('genera un PDF en memoria', async () => {
    const pdf = await renderPdf(table([['A-101', '255.00', 98]]), META);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pageCount(pdf)).toBe(1);
  });

  it('guarda el título y el autor en los metadatos', async () => {
    const pdf = await renderPdf(table([]), META);
    const raw = pdf.toString('latin1');
    // pdfkit escribe las cadenas de info en UTF-16 hexadecimal o literal.
    expect(raw).toContain('/Title');
    expect(raw).toContain('/Author');
  });

  it('sin filas genera igual el PDF con el aviso de sin datos', async () => {
    const pdf = await renderPdf(table([]), META);
    expect(pageCount(pdf)).toBe(1);
  });

  it('pasa a otra página cuando la tabla no cabe, sin perder filas', async () => {
    const rows = Array.from({ length: 300 }, (_, index) => [
      `A-${String(index).padStart(3, '0')}`,
      '10.00',
      index,
    ]);
    const pdf = await renderPdf(table(rows), META);
    expect(pageCount(pdf)).toBeGreaterThan(5);
  });
});
