'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Usuario, PapelUsuario, CriarUsuarioDTO } from '@/types/stock';
import { 
  Users, 
  UserPlus, 
  Shield, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  RefreshCw 
} from 'lucide-react';

export default function UsuariosPage() {
  const { usuario: usuarioLogado } = useAuth();
  const isAdmin = usuarioLogado?.papel === 'ADMIN';

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  // Modal / Formulário de Criação
  const [modalCriarAberto, setModalCriarAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [novoEmail, setNovoEmail] = useState('');
  const [novoNome, setNovoNome] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [novoPapel, setNovoPapel] = useState<PapelUsuario>('OPERADOR');

  // Ação em andamento em um usuário da lista
  const [uidEmAtualizacao, setUidEmAtualizacao] = useState<string | null>(null);

  async function carregarUsuarios() {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch('/api/usuarios');
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.erro || 'Falha ao buscar lista de usuários.');
      }
      const data = await res.json();
      setUsuarios(data);
    } catch (err: any) {
      setErro(err.message || 'Erro ao carregar usuários.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    if (isAdmin) {
      carregarUsuarios();
    }
  }, [isAdmin]);

  async function handleCriarUsuario(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    setSucesso(null);

    const dto: CriarUsuarioDTO = {
      email: novoEmail,
      nome: novoNome,
      senha: novaSenha,
      papel: novoPapel,
    };

    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.erro || 'Erro ao criar usuário.');
      }

      setSucesso(`Usuário "${data.nome}" (${data.email}) cadastrado com sucesso!`);
      setModalCriarAberto(false);
      setNovoEmail('');
      setNovoNome('');
      setNovaSenha('');
      setNovoPapel('OPERADOR');
      await carregarUsuarios();
    } catch (err: any) {
      setErro(err.message || 'Erro ao salvar novo usuário.');
    } finally {
      setSalvando(false);
    }
  }

  async function handleAlterarStatus(u: Usuario) {
    setUidEmAtualizacao(u.uid);
    setErro(null);
    setSucesso(null);

    try {
      const res = await fetch('/api/usuarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: u.uid,
          ativo: !u.ativo,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.erro || 'Erro ao atualizar status.');
      }

      setSucesso(`Status de "${u.nome}" alterado para ${data.ativo ? 'ATIVO' : 'DESATIVADO'}.`);
      await carregarUsuarios();
    } catch (err: any) {
      setErro(err.message || 'Erro ao modificar status do usuário.');
    } finally {
      setUidEmAtualizacao(null);
    }
  }

  async function handleAlterarPapel(u: Usuario, novoPapel: PapelUsuario) {
    if (u.papel === novoPapel) return;

    setUidEmAtualizacao(u.uid);
    setErro(null);
    setSucesso(null);

    try {
      const res = await fetch('/api/usuarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: u.uid,
          papel: novoPapel,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.erro || 'Erro ao alterar papel.');
      }

      setSucesso(`Papel de "${u.nome}" atualizado para ${data.papel}.`);
      await carregarUsuarios();
    } catch (err: any) {
      setErro(err.message || 'Erro ao modificar papel do usuário.');
    } finally {
      setUidEmAtualizacao(null);
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <div className="w-16 h-16 bg-red-950/40 border border-red-800 text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Shield className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Acesso Restrito</h1>
        <p className="text-zinc-400 text-sm">
          Esta página é restrita a administradores do sistema (perfil ADMIN). Seu perfil atual ({usuarioLogado?.papel || 'CONSULTA'}) não possui autorização.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Users className="w-6 h-6 text-purple-400" />
            Controle de Usuários e Acessos
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Gerenciamento de identidades, papéis RBAC e status de ativação (Firebase Auth + Firestore).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={carregarUsuarios}
            disabled={carregando}
            className="p-2.5 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition"
            title="Recarregar"
          >
            <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setModalCriarAberto(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-medium text-sm rounded-lg shadow-md transition"
          >
            <UserPlus className="w-4 h-4" />
            <span>Novo Usuário</span>
          </button>
        </div>
      </div>

      {/* Alertas */}
      {erro && (
        <div className="p-4 rounded-lg bg-red-950/40 border border-red-800/80 text-red-300 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400" />
          <span>{erro}</span>
        </div>
      )}

      {sucesso && (
        <div className="p-4 rounded-lg bg-emerald-950/40 border border-emerald-800/80 text-emerald-300 text-sm flex items-center gap-3">
          <CheckCircle className="w-5 h-5 flex-shrink-0 text-emerald-400" />
          <span>{sucesso}</span>
        </div>
      )}

      {/* Tabela de Usuários */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-300">
            <thead className="bg-zinc-950/80 text-xs font-mono uppercase text-zinc-400 border-b border-zinc-800">
              <tr>
                <th className="py-3.5 px-4">Nome / Usuário</th>
                <th className="py-3.5 px-4">E-mail</th>
                <th className="py-3.5 px-4">Papel (RBAC)</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-sans">
              {carregando && usuarios.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-400" />
                    Carregando usuários do sistema...
                  </td>
                </tr>
              ) : usuarios.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-500">
                    Nenhum usuário cadastrado.
                  </td>
                </tr>
              ) : (
                usuarios.map((u) => {
                  const emAtualizacao = uidEmAtualizacao === u.uid;

                  return (
                    <tr key={u.uid} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-white">
                        {u.nome}
                        <div className="text-[11px] font-mono text-zinc-500">{u.uid}</div>
                      </td>
                      <td className="py-3.5 px-4 text-zinc-300 font-mono text-xs">
                        {u.email}
                      </td>
                      <td className="py-3.5 px-4">
                        <select
                          value={u.papel}
                          onChange={(e) => handleAlterarPapel(u, e.target.value as PapelUsuario)}
                          disabled={emAtualizacao}
                          className="bg-zinc-950 border border-zinc-700 rounded-md px-2.5 py-1 text-xs font-semibold focus:outline-none focus:border-purple-500"
                        >
                          <option value="CONSULTA">CONSULTA (Leitura)</option>
                          <option value="OPERADOR">OPERADOR (Estoque + Produtos)</option>
                          <option value="ADMIN">ADMIN (Acesso Total)</option>
                        </select>
                      </td>
                      <td className="py-3.5 px-4">
                        {u.ativo ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-950/60 text-red-400 border border-red-800/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                            Desativado
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleAlterarStatus(u)}
                          disabled={emAtualizacao}
                          className={`text-xs px-3 py-1.5 rounded-md border font-medium transition ${
                            u.ativo
                              ? 'border-red-800/60 text-red-400 hover:bg-red-950/40'
                              : 'border-emerald-800/60 text-emerald-400 hover:bg-emerald-950/40'
                          } disabled:opacity-50`}
                        >
                          {emAtualizacao ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : u.ativo ? (
                            'Desativar'
                          ) : (
                            'Ativar'
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Criação de Usuário */}
      {modalCriarAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-5">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-purple-400" />
                Criar Novo Usuário
              </h2>
              <button
                onClick={() => setModalCriarAberto(false)}
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCriarUsuario} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
                  Nome Completo
                </label>
                <input
                  type="text"
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  placeholder="ex: João da Silva"
                  required
                  disabled={salvando}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
                  E-mail
                </label>
                <input
                  type="email"
                  value={novoEmail}
                  onChange={(e) => setNovoEmail(e.target.value)}
                  placeholder="ex: operador@rss3.com.br"
                  required
                  disabled={salvando}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
                  Senha Provisória
                </label>
                <input
                  type="password"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  disabled={salvando}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
                  Papel no Sistema (RBAC)
                </label>
                <select
                  value={novoPapel}
                  onChange={(e) => setNovoPapel(e.target.value as PapelUsuario)}
                  disabled={salvando}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-purple-500 text-sm"
                >
                  <option value="CONSULTA">CONSULTA — Somente Visualização</option>
                  <option value="OPERADOR">OPERADOR — Estoque + Materiais</option>
                  <option value="ADMIN">ADMIN — Acesso Irrestrito + Usuários</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setModalCriarAberto(false)}
                  disabled={salvando}
                  className="px-4 py-2 text-sm text-zinc-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium text-sm rounded-lg shadow-md flex items-center gap-2 disabled:opacity-50"
                >
                  {salvando ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Cadastrando...</span>
                    </>
                  ) : (
                    <span>Salvar Usuário</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
