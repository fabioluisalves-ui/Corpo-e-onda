# Impressão de etiquetas e configuração do leitor

## Leitor USB / Bluetooth

O leitor funciona como **teclado (HID)**: ao ler um código, ele "digita" o conteúdo
(SKU) e envia **Enter**. Nenhum driver especial é necessário.

Configuração recomendada:
- Sufixo do leitor: **Enter (CR)**. A maioria vem assim de fábrica; consulte o manual
  do modelo para ativar o sufixo CR se necessário.
- Simbologia: **Code 128** habilitada (padrão na maioria dos leitores 1D).
- Layout de teclado do leitor igual ao do sistema operacional (evita trocar caracteres).

Na tela **Entrada de Produção**, o campo de leitura já inicia **em foco**. Basta ler
o código: o sistema busca a variante, você digita a quantidade e confirma. Após o
registro, o foco volta automaticamente para a próxima leitura.

## Etiquetas

- Geradas em **SVG** (pré-visualização/vetorial) e **PDF** (`pdfkit`).
- Cada etiqueta contém: nome do produto, cor, tamanho, SKU legível, **Code 128** e a marca.
- Tamanho configurável (padrão 50×30 mm). Ideal para impressora térmica ou comum.
- Impressão de **uma** etiqueta ou **em lote** (informe a quantidade).
- **Reimpressão não altera o estoque** (o endpoint de etiquetas apenas desenha).

### Impressora térmica
- Defina o tamanho da mídia igual ao configurado (ex.: 50×30 mm).
- Imprima o PDF em escala 100% (sem "ajustar à página").

### API
`POST /api/v1/labels/pdf` com `{ items: [{ variantId, copies }], widthMm, heightMm }`.
`POST /api/v1/barcodes/generate` com `{ text }` retorna o SVG do Code 128.
