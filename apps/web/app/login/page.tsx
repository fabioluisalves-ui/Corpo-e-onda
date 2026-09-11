'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken } from '../../lib/api';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('operador@corpoonda.com.br');
  const [password, setPassword] = useState('MudarSenha123!');
  const [erro, setErro] = useState('');

  async function entrar() {
    setErro('');
    try {
      const r = await api.login(email, password);
      setToken(r.accessToken);
      router.push('/entrada-producao');
    } catch (e: any) { setErro(e.message); }
  }

  return (
    <div className="max-w-sm mx-auto space-y-3">
      <h1 className="text-xl font-bold">Entrar</h1>
      <input className="w-full border rounded p-2" value={email} onChange={e => setEmail(e.target.value)} placeholder="E-mail" />
      <input className="w-full border rounded p-2" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Senha" />
      {erro && <p className="text-red-600 text-sm">{erro}</p>}
      <button className="w-full bg-marca text-white rounded p-2" onClick={entrar}>Entrar</button>
    </div>
  );
}
