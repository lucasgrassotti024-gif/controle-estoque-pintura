'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { ShieldCheck, LogIn, AlertCircle, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMensagemErro(null);

    if (!email || !senha) {
      setMensagemErro('Preencha o e-mail e a senha.');
      return;
    }

    setCarregando(true);

    try {
      const res = await login(email, senha);

      if (!res.sucesso) {
        setMensagemErro(res.erro || 'Falha na autenticação. Verifique os dados.');
        setCarregando(false);
        return;
      }

      setSucesso(true);
      router.push('/estoque');
      router.refresh();
    } catch (err: any) {
      setMensagemErro(err?.message || 'Erro inesperado ao conectar ao servidor.');
      setCarregando(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 font-sans text-slate-100">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-8 backdrop-blur-md">
        
        {/* Header do Formulário */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-14 h-14 bg-blue-600/10 border border-blue-500/20 text-blue-500 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Controle de Estoque
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Sistema Industrial de Pintura — RSS3
          </p>
        </div>

        {/* Alerta de Erro */}
        {mensagemErro && (
          <div className="mb-6 p-4 rounded-lg bg-red-950/40 border border-red-800/60 flex items-start gap-3 text-red-300 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400 mt-0.5" />
            <span className="leading-snug">{mensagemErro}</span>
          </div>
        )}

        {/* Alerta de Sucesso */}
        {sucesso && (
          <div className="mb-6 p-4 rounded-lg bg-emerald-950/40 border border-emerald-800/60 flex items-start gap-3 text-emerald-300 text-sm">
            <ShieldCheck className="w-5 h-5 flex-shrink-0 text-emerald-400 mt-0.5" />
            <span className="leading-snug">Autenticado com sucesso! Redirecionando...</span>
          </div>
        )}

        {/* Formulário de Login */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
              E-mail de Acesso
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ex: operador@rss3.com.br"
              disabled={carregando || sucesso}
              required
              className="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
              Senha
            </label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
              disabled={carregando || sucesso}
              required
              className="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={carregando || sucesso}
            className="w-full mt-2 py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {carregando ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Autenticando...</span>
              </>
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                <span>Entrar no Sistema</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center text-xs text-slate-500">
          Autenticação centralizada com controle de acesso RBAC.
        </div>
      </div>
    </div>
  );
}
