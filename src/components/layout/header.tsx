'use client';

import React from 'react';
import { Menu, LogOut, User as UserIcon, Wifi, WifiOff, AlertTriangle, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useConnectivity } from '@/contexts/connectivity-context';

interface HeaderProps {
  onAbrirMobile: () => void;
}

export function Header({ onAbrirMobile }: HeaderProps) {
  const { usuario, email, logout, autenticado } = useAuth();
  const { status, checkNow } = useConnectivity();

  const renderBadgeConectividade = () => {
    switch (status) {
      case 'ONLINE':
        return (
          <div 
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 text-xs font-mono select-none"
            title="Conexão com o servidor ativa e saudável"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <Wifi className="w-3.5 h-3.5" />
            <span>Online</span>
          </div>
        );
      case 'CHECKING':
        return (
          <div 
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-950/60 border border-sky-800/60 text-sky-400 text-xs font-mono select-none"
            title="Verificando comunicação com o servidor..."
          >
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
            <span>Verificando</span>
          </div>
        );
      case 'DEGRADED':
        return (
          <div 
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950/60 border border-amber-800/60 text-amber-400 text-xs font-mono select-none cursor-pointer hover:bg-amber-900/40 transition-colors"
            title="Sinal instável. Clique para verificar agora."
            onClick={() => checkNow()}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>Sinal instável</span>
          </div>
        );
      case 'OFFLINE':
      default:
        return (
          <div 
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-950/60 border border-rose-800/60 text-rose-400 text-xs font-mono select-none cursor-pointer hover:bg-rose-900/40 transition-colors"
            title="Sem conexão com o servidor. Clique para tentar reconectar."
            onClick={() => checkNow()}
          >
            <WifiOff className="w-3.5 h-3.5 text-rose-400" />
            <span>Offline</span>
          </div>
        );
    }
  };

  return (
    <header className="h-16 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md px-4 lg:px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Botão Menu Mobile e Título */}
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

      {/* Seção de Conectividade, Usuário e Logout */}
      <div className="flex items-center gap-4">
        {/* Badge de Conectividade Industrial */}
        {renderBadgeConectividade()}

        {autenticado && (
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
        )}
      </div>
    </header>
  );
}
