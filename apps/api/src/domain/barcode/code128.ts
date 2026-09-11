/**
 * Geração de código de barras Code 128 usando a biblioteca consolidada bwip-js.
 * NÃO desenhamos as barras manualmente.
 *
 * O internal_barcode representa o SKU (ex.: TOP-MARE-AZC-P).
 * O GTIN/EAN-13 oficial é campo separado e NÃO é gerado aqui.
 */
import bwipjs from 'bwip-js';

export interface BarcodeOptions {
  /** Altura das barras em mm (bwip usa "height" em mm quando scale aplicado). */
  heightMm?: number;
  /** Exibir texto legível abaixo das barras. */
  includetext?: boolean;
  scale?: number;
}

/** Gera o Code 128 como SVG (vetorial, ideal para etiquetas e PDF). */
export function generateCode128Svg(text: string, opts: BarcodeOptions = {}): string {
  return bwipjs.toSVG({
    bcid: 'code128',
    text,
    height: opts.heightMm ?? 12,
    includetext: opts.includetext ?? true,
    textxalign: 'center',
    textsize: 8,
  });
}

/** Gera o Code 128 como PNG (Buffer), útil para pré-visualização em <img>. */
export async function generateCode128Png(text: string, opts: BarcodeOptions = {}): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: 'code128',
    text,
    scale: opts.scale ?? 3,
    height: opts.heightMm ?? 12,
    includetext: opts.includetext ?? true,
    textxalign: 'center',
  });
}
