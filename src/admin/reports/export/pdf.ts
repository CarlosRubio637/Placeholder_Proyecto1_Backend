import PDFDocument from 'pdfkit';
import { REPORT_HEADER } from './export.constants.js';
import {
  dateTimeEs,
  type Cell,
  type ExportMeta,
  type ReportTable,
} from './report-table.js';

type Doc = PDFKit.PDFDocument;

const MARGIN = 40;
/** Espacio reservado al pie de cada página para "Página x de y". */
const FOOTER = 20;
const CELL_PADDING = 4;
const FONT = 'Helvetica';
const BOLD = 'Helvetica-Bold';
const BODY_SIZE = 9;
const MUTED = '#555555';
const RULE = '#cccccc';
const HEADER_FILL = '#e8e8e8';
/** Con más columnas que esto, la página va horizontal. */
const PORTRAIT_MAX_COLUMNS = 5;

const NUMERIC = /^-?\d+(\.\d+)?$/;

function cellText(value: Cell): string {
  return value === null ? '' : String(value);
}

function isNumeric(value: Cell): boolean {
  return typeof value === 'number' || (value !== null && NUMERIC.test(value));
}

/** Ancho de cada columna, proporcional a su texto más largo (con tope). */
function columnWidths(table: ReportTable, total: number): number[] {
  const weights = table.columns.map((column, index) => {
    const longest = Math.max(
      column.length,
      ...table.rows.map((row) => cellText(row[index]).length),
    );
    return Math.min(Math.max(longest, 6), 40);
  });
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  return weights.map((weight) => (weight / sum) * total);
}

function pairs(doc: Doc, title: string, items: [string, string][]): void {
  if (items.length === 0) return;
  doc.moveDown(0.8);
  doc.font(BOLD).fontSize(11).fillColor('black').text(title, MARGIN);
  doc.moveDown(0.2);
  for (const [label, value] of items) {
    doc
      .fontSize(BODY_SIZE)
      .font(BOLD)
      .text(`${label}: `, MARGIN, undefined, { continued: true })
      .font(FONT)
      .text(value);
  }
}

class TableWriter {
  private readonly widths: number[];
  private readonly numeric: boolean[];

  constructor(
    private readonly doc: Doc,
    private readonly table: ReportTable,
  ) {
    this.widths = columnWidths(table, doc.page.width - 2 * MARGIN);
    // Una columna se alinea a la derecha si todos sus valores son números.
    this.numeric = table.columns.map(
      (_, index) =>
        table.rows.length > 0 &&
        table.rows.every((row) => row[index] === null || isNumeric(row[index])),
    );
  }

  write(): void {
    this.header();
    for (const row of this.table.rows) this.row(row.map(cellText), false);
  }

  private header(): void {
    this.row(this.table.columns, true);
  }

  private row(cells: string[], isHeader: boolean): void {
    const doc = this.doc;
    doc.font(isHeader ? BOLD : FONT).fontSize(BODY_SIZE);
    const height =
      Math.max(
        ...cells.map((text, index) =>
          doc.heightOfString(text || ' ', {
            width: this.widths[index] - 2 * CELL_PADDING,
          }),
        ),
      ) +
      2 * CELL_PADDING;

    const bottom = doc.page.height - MARGIN - FOOTER;
    if (doc.y + height > bottom) {
      doc.addPage();
      // La tabla sigue en la página nueva con sus encabezados.
      if (!isHeader) this.header();
      doc.font(isHeader ? BOLD : FONT).fontSize(BODY_SIZE);
    }

    const top = doc.y;
    const width = doc.page.width - 2 * MARGIN;
    if (isHeader) {
      doc.rect(MARGIN, top, width, height).fill(HEADER_FILL);
    }
    doc.fillColor('black');

    let x = MARGIN;
    cells.forEach((text, index) => {
      doc.text(text, x + CELL_PADDING, top + CELL_PADDING, {
        width: this.widths[index] - 2 * CELL_PADDING,
        align: this.numeric[index] ? 'right' : 'left',
      });
      x += this.widths[index];
    });

    doc
      .moveTo(MARGIN, top + height)
      .lineTo(MARGIN + width, top + height)
      .lineWidth(0.5)
      .strokeColor(RULE)
      .stroke();
    doc.x = MARGIN;
    doc.y = top + height;
  }
}

/** "Página x de y" al pie de cada página. */
function pageNumbers(doc: Doc): void {
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index++) {
    doc.switchToPage(range.start + index);
    // Sin margen inferior, escribir en el pie no abre otra página.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font(FONT)
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        `Página ${index + 1} de ${range.count}`,
        MARGIN,
        doc.page.height - MARGIN,
        { width: doc.page.width - 2 * MARGIN, align: 'right' },
      );
    doc.page.margins.bottom = bottomMargin;
  }
}

/**
 * PDF del reporte (H36), generado en memoria: encabezado, título, filtros,
 * fecha y autor de la generación, cifras resumen y la tabla completa, que
 * repite sus encabezados en cada página.
 */
export function renderPdf(
  table: ReportTable,
  meta: ExportMeta,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    layout:
      table.columns.length > PORTRAIT_MAX_COLUMNS ? 'landscape' : 'portrait',
    margin: MARGIN,
    bufferPages: true,
    info: {
      Title: table.title,
      Author: meta.generatedBy,
      Creator: REPORT_HEADER,
    },
  });

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.font(BOLD).fontSize(10).fillColor(MUTED).text(REPORT_HEADER);
  doc.font(BOLD).fontSize(16).fillColor('black').text(table.title);
  doc.moveDown(0.3);
  doc
    .font(FONT)
    .fontSize(BODY_SIZE)
    .fillColor(MUTED)
    .text(
      `Generado el ${dateTimeEs(meta.generatedAt)} por ${meta.generatedBy}`,
    );

  pairs(doc, 'Filtros aplicados', table.filters);
  pairs(doc, 'Resumen', table.summary);

  doc.moveDown(0.8);
  doc.font(BOLD).fontSize(11).fillColor('black').text(table.tableTitle, MARGIN);
  doc.moveDown(0.3);
  if (table.rows.length === 0) {
    doc
      .font(FONT)
      .fontSize(BODY_SIZE)
      .fillColor(MUTED)
      .text('Sin datos para los filtros aplicados.');
  } else {
    new TableWriter(doc, table).write();
  }

  pageNumbers(doc);
  doc.end();
  return done;
}
