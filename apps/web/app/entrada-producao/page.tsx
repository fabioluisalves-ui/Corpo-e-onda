'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';

type Etapa = 'LEITURA' | 'QUANTIDADE' | 'CONFIRMACAO';

export default function EntradaProducao() {
  const [etapa, setEtapa] = useState<Etapa>('LEITURA');
  const [variant, setVariant] = useState<any>(null);
  const [quantidade, setQuantidade] = useState('');
  const [resultado, setResultado] = useState<any>(null);
  const [erro, setErro] = useState('');
  const leituraRef = useRef<HTMLInputElement>(null);
  const qtdRef = useRef<HTMLInputElement>(null);

  // 1) O campo de leitura inicia automaticamente em foco.
  useEffect(() => { if (etapa === 'LEITURA') leituraRef.current?.focus(); }, [etapa]);
  useEffect(() => { if (etapa === 'QUANTIDADE') qtdRef.current?.focus(); }, [etapa]);

  // 2-4) Leitor USB/Bluetooth envia o SKU + Enter -> busca a variante.
  async function onLeitura(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    const codigo = (e.target as HTMLInputElement).value.trim();
    if (!codigo) return;
    setErro('');
    try {
      const v = await api.lookup(codigo);
      setVariant(v);
      setEtapa('QUANTIDADE');
    } catch (err: any) { setErro(err.message); }
    (e.target as HTMLInputElement).value = '';
  }

  // 5-6) Digita a quantidade e vê a confirmação (saldo anterior, entrada, novo saldo).
  function confirmarQuantidade(e: React.KeyboardEvent<HTMLInputElement> | null) {
    if (e && e.key !== 'Enter') return;
    const q = Number(quantidade);
    if (!Number.isInteger(q) || q <= 0) { setErro('Quantidade inválida.'); return; }
    setEtapa('CONFIRMACAO');
  }

  // 7-9) Confirma -> registra PRODUCTION_ENTRY imutável (idempotente) -> volta à leitura.
  async function registrar() {
    setErro('');
    const idempotencyKey = crypto.randomUUID(); // evita duplo clique / reenvio
    try {
      const r = await api.productionEntry({ barcodeOrSku: variant.sku, quantity: Number(quantidade) }, idempotencyKey);
      setResultado(r);
      setEtapa('LEITURA');
      setVariant(null); setQuantidade('');
    } catch (err: any) { setErro(err.message); }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Entrada de Produção</h1>
      {erro && <p className="text-red-600">{erro}</p>}

      {etapa === 'LEITURA' && (
        <div className="space-y-2">
          <label className="text-sm text-slate-600">Leia o código de barras (SKU) — o foco já está aqui:</label>
          <input ref={leituraRef} className="w-full border-2 border-marca rounded p-3 text-lg"
                 placeholder="Aguardando leitura..." onKeyDown={onLeitura} />
          {resultado && (
            <div className="rounded bg-green-50 border border-green-300 p-3 text-sm">
              Registrado: <b>{resultado.variant?.sku}</b> — novo saldo{' '}
              <b>{resultado.movement?.newOnHand}</b>.
            </div>
          )}
        </div>
      )}

      {etapa === 'QUANTIDADE' && variant && (
        <div className="space-y-3">
          <div className="rounded border p-3">
            <div className="font-semibold">{variant.product?.name}</div>
            <div className="text-sm text-slate-600">
              Categoria: {variant.product?.category ?? '-'} • Cor: {variant.color ?? '-'} • Tam: {variant.size ?? '-'}
            </div>
            <div className="text-sm">SKU: <b>{variant.sku}</b></div>
          </div>
          <label className="text-sm text-slate-600">Quantidade fabricada:</label>
          <input ref={qtdRef} className="w-full border-2 border-marca rounded p-3 text-lg" inputMode="numeric"
                 value={quantidade} onChange={e => setQuantidade(e.target.value)}
                 onKeyDown={confirmarQuantidade} placeholder="Ex.: 20" />
          <button className="bg-marca text-white rounded p-2 w-full" onClick={() => confirmarQuantidade(null)}>Revisar</button>
        </div>
      )}

      {etapa === 'CONFIRMACAO' && variant && (
        <div className="space-y-3">
          <div className="rounded border p-3">
            <div>{variant.product?.name} — {variant.sku}</div>
            <div className="text-sm text-slate-600">Quantidade a registrar: <b>{quantidade}</b></div>
          </div>
          <div className="flex gap-2">
            <button className="bg-marca text-white rounded p-2 flex-1" onClick={registrar}>Confirmar entrada</button>
            <button className="border rounded p-2 flex-1" onClick={() => setEtapa('QUANTIDADE')}>Voltar</button>
          </div>
          <p className="text-xs text-slate-500">
            Após confirmar, é possível imprimir a mesma quantidade de etiquetas (tela Etiquetas).
          </p>
        </div>
      )}
    </div>
  );
}
