'use client';

import React from 'react';
import { Menu, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

interface HeaderProps {
  onAbrirMobile: () => void;
}

export function Header({ onAbrirMobile }: HeaderProps) {
  const { usuario, email, logout, autenticado } = useAuth();

  return (
    <header className="h-16 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md px-4 lg:px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Botão Menu Mobile */}
      <div className="flex items-center gap-3">
        <button
          onClick={onAbrirMobile}
          className="p-2 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 lg:hidden"
          aria-label="Abrir menu de navegação"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="hidden sm:flex flex-col">
          <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
            Estoque / Visão Geral
          </span>
          <h1 className="text-sm font-semibold text-zinc-200">
            Controle Operacional de Materiais
          </h1>
        </div>
      </div>

      {/* Seção de Usuário e Logout */}
      <div className="flex items-center gap-3">
        {autenticado ? (
          <div className="flex items-center gap-3 pl-3 border-l border-zinc-800">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
                <UserIcon className="w-3.5 h-3.5" />
              </div>
              <div className="hidden md:flex flex-col text-left">
                <span className="text-xs font-medium text-zinc-200 leading-tight">
                  {usuario?.nome || email}
                </span>
                <span className={`text-[10px] font-mono uppercase tracking-wider font-semibold ${
                  usuario?.papel === 'ADMIN'
                    ? 'text-purple-400'
                    : usuario?.papel === 'OPERADOR'
                    ? 'text-amber-400'
                    : 'text-blue-400'
                }`}>
                  {usuario?.papel || 'CONSULTA'}
                </span>
              </div>
            </div>


            <button
              onClick={logout}
              className="p-1.5 rounded-md text-zinc-400 hover:text-red-400 hover:bg-red-950/40 border border-transparent hover:border-red-900/50 transition-colors"
              title="Encerrar sessão (Logout)"
              aria-label="Encerrar sessão"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
            <span className="w-2 h-2 rounded-full bg-zinc-600" />
            <span>Modo Operacional Local</span>
          </div>
        )}
      </div>
    </header>
  );
}
