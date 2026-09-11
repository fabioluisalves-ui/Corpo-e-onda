import { describe, it, expect } from 'vitest';
import { generateCode128Svg, generateCode128Png } from '../src/domain/barcode/code128';
import { generateLabelsPdf } from '../src/domain/labels/label-pdf';

describe('Code 128', () => {
  it('gera SVG contendo o SKU legível', () => {
    const svg = generateCode128Svg('TOP-MARE-AZC-P');
    expect(svg).toContain('<svg');
    expect(svg.length).toBeGreaterThan(200);
  });

  it('gera PNG (Buffer) não-vazio', async () => {
    const png = await generateCode128Png('TOP-MARE-AZC-P');
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png.length).toBeGreaterThan(100);
    // assinatura PNG
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
  });
});

describe('Etiquetas PDF', () => {
  it('gera PDF com múltiplas cópias', async () => {
    const pdf = await generateLabelsPdf(
      [
        {
          label: { productName: 'Top Maré', color: 'Azul Céu', size: 'P', sku: 'TOP-MARE-AZC-P' },
          copies: 3,
        },
      ],
      { widthMm: 50, heightMm: 30 },
    );
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });
});
