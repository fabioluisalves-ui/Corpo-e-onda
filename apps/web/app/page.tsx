import Link from 'next/link';

export default function Home() {
  const telas = [
    { href: '/login', label: 'Login' },
    { href: '/entrada-producao', label: 'Entrada de Produção' },
    { href: '/estoque', label: 'Estoque Atual' },
  ];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Painel</h1>
      <ul className="grid grid-cols-2 gap-3">
        {telas.map((t) => (
          <li key={t.href}>
            <Link href={t.href} className="block rounded border p-4 hover:bg-slate-100">{t.label}</Link>
          </li>
        ))}
      </ul>
      <p className="text-sm text-slate-500">
        Demais telas (produtos, variantes, etiquetas, venda, kits, histórico, usuários, integrações)
        seguem o mesmo padrão de cliente de API. Ver docs/pendencias.md.
      </p>
    </div>
  );
}
