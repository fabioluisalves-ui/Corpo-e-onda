/**
 * Geração de etiquetas em PDF (impressora térmica ou convencional).
 * Cada etiqueta contém: nome do produto, cor, tamanho, SKU legível,
 * código de barras Code 128 e a marca "Corpo & Onda".
 *
 * O código de barras é embutido como PNG gerado por bwip-js (Code 128).
 * A reimpressão NÃO altera estoque (esta função apenas desenha).
 */
import PDFDocument from 'pdfkit';
import { generateCode128Png } from '../barcode/code128';

export interface LabelData {
  productName: string;
  color: string;
  size: string;
  sku: string;
  brand?: string;
}

export interface LabelSize {
  widthMm: number;
  heightMm: number;
}

const MM_TO_PT = 2.834645669; // 1 mm = 2.8346 pt

export interface LabelJob {
  label: LabelData;
  copies: number;
}

/** Gera um PDF (Buffer) com N etiquetas por linha de job, uma etiqueta por página. */
export async function generateLabelsPdf(
  jobs: LabelJob[],
  size: LabelSize = { widthMm: 50, heightMm: 30 },
): Promise<Buffer> {
  const w = size.widthMm * MM_TO_PT;
  const h = size.heightMm * MM_TO_PT;

  const doc = new PDFDocument({ size: [w, h], margin: 0, autoFirstPage: false });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  for (const job of jobs) {
    const png = await generateCode128Png(job.label.sku, { heightMm: 10, scale: 3 });
    const copies = Math.max(1, Math.floor(job.copies));
    for (let i = 0; i < copies; i++) {
      doc.addPage({ size: [w, h], margin: 0 });
      const pad = 4;
      doc
        .fontSize(7)
        .fillColor('#111')
        .text(job.label.brand ?? 'Corpo & Onda', pad, pad, { width: w - pad * 2, align: 'center' });
      doc
        .fontSize(8)
        .text(job.label.productName, pad, pad + 10, { width: w - pad * 2, align: 'center' });
      doc
        .fontSize(7)
        .text(`Cor: ${job.label.color}  •  Tam: ${job.label.size}`, pad, pad + 22, {
          width: w - pad * 2,
          align: 'center',
        });
      const imgW = w - pad * 2;
      doc.image(png, pad, pad + 34, { width: imgW, align: 'center' });
    }
  }

  doc.end();
  return done;
}
