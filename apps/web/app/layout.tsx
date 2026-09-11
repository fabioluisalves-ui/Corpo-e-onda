import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Corpo & Onda Estoque',
  description: 'Controle de estoque por variante',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="bg-marca text-white px-4 py-3 font-semibold">Corpo &amp; Onda Estoque</header>
        <main className="max-w-4xl mx-auto p-4">{children}</main>
      </body>
    </html>
  );
}
