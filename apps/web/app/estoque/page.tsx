'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

export default function Estoque() {
  const [rows, setRows] = useState<any[]>([]);
  const [erro, setErro] = useState('');
  useEffect(() => { api.stock().then(setRows).catch(e => setErro(e.message)); }, []);
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Estoque Atual</h1>
      {erro && <p className="text-red-600">{erro} (faça login primeiro)</p>}
      <table className="w-full text-sm border">
        <thead className="bg-slate-100">
          <tr><th className="text-left p-2">SKU</th><th className="text-left p-2">Produto</th>
          <th className="p-2">Físico</th><th className="p-2">Reservado</th><th className="p-2">Disponível</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-2">{r.variant?.sku}</td>
              <td className="p-2">{r.variant?.product?.name}</td>
              <td className="p-2 text-center">{r.onHand}</td>
              <td className="p-2 text-center">{r.reserved}</td>
              <td className="p-2 text-center font-semibold">{r.onHand - r.reserved}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
