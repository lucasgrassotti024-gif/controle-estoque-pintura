'use client';

import React, { useState } from 'react';
import { Usuario, PapelUsuario } from '@/types/stock';
import { UserCheck, X, Loader2, AlertCircle } from 'lucide-react';

interface UsuarioEditModalProps {
  usuario: Usuario | null;
  aoSalvarSucesso: (usuarioAtualizado: Usuario) => void;
  aoFechar: () => void;
}

export function UsuarioEditModal({
  usuario,
  aoSalvarSucesso,
  aoFechar,
}: UsuarioEditModalProps) {
  const [nome, setNome] = useState(usuario?.nome || '');
  const [papel, setPapel] = useState<PapelUsuario>(usuario?.papel || 'CONSULTA');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!usuario) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) {
      setErro('O nome do usuário é obrigatório.');
      return;
    }

    setSalvando(true);
    setErro(null);

    try {
      const res = await fetch('/api/usuarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: usuario!.uid,
          nome: nome.trim(),
          papel,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.erro || 'Falha ao atualizar dados do usuário.');
      }

      aoSalvarSucesso(data);
      aoFechar();
    } catch (err: any) {
      setErro(err.message || 'Erro ao salvar alterações.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget && !salvando) aoFechar();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-950/60 border border-purple-800/80 flex items-center justify-center text-purple-400">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                Editar Usuário
              </h2>
              <span className="text-[11px] font-mono text-zinc-400">
                {usuario.email}
              </span>
            </div>
          </div>
          <button
            onClick={aoFechar}
            disabled={salvando}
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
              Nome Completo
            </label>
            <input
              type="text"
              required
              disabled={salvando}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-purple-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
              Papel / Permissão RBAC
            </label>
            <select
              value={papel}
              disabled={salvando}
              onChange={(e) => setPapel(e.target.value as PapelUsuario)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-purple-500 text-sm"
            >
              <option value="CONSULTA">CONSULTA (Somente Leitura)</option>
              <option value="OPERADOR">OPERADOR (Estoque + Produtos)</option>
              <option value="ADMIN">ADMIN (Controle Total + Usuários)</option>
            </select>
          </div>

          {erro && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{erro}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
            <button
              type="button"
              disabled={salvando}
              onClick={aoFechar}
              className="px-4 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs rounded-md shadow transition cursor-pointer"
            >
              {salvando ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <span>Salvar Alterações</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
