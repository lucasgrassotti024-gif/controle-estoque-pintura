'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Boxes, 
  Layers, 
  ArrowLeftRight, 
  ClipboardCheck, 
  Users,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils/formatters';
import { useAuth } from '@/contexts/auth-context';

interface SidebarProps {
  abertoNoMobile: boolean;
  onFecharMobile: () => void;
}

const ITENS_MENU = [
  {
    nome: 'Estoque',
    href: '/estoque',
    icone: Boxes,
    descricao: 'Posição e saldos atuais',
  },
  {
    nome: 'Produtos',
    href: '/produtos',
    icone: Layers,
    descricao: 'Catálogo de materiais',
  },
  {
    nome: 'Movimentações',
    href: '/movimentacoes',
    icone: ArrowLeftRight,
    descricao: 'Histórico de entradas/saídas',
  },
  {
    nome: 'Conferências',
    href: '/conferencias',
    icone: ClipboardCheck,
    descricao: 'Conferência física e ajustes',
  },
  {
    nome: 'Usuários',
    href: '/usuarios',
    icone: Users,
    descricao: 'Controle de acesso e papéis',
    apenasAdmin: true,
  },
];


export function Sidebar({ abertoNoMobile, onFecharMobile }: SidebarProps) {
  const pathname = usePathname();
  const { usuario } = useAuth();
  const isAdmin = usuario?.papel === 'ADMIN';

  return (
    <>
      {/* Backdrop Mobile */}
      {abertoNoMobile && (
        <div 
          className="fixed inset-0 bg-black/70 z-40 lg:hidden backdrop-blur-xs transition-opacity"
          onClick={onFecharMobile}
          aria-hidden="true"
        />
      )}

      {/* Container da Barra Lateral */}
      <aside
        className={cn(
          'fixed top-0 bottom-0 left-0 z-50 w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:z-auto',
          abertoNoMobile ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Cabeçalho da Sidebar */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-amber-500 flex items-center justify-center text-zinc-950 font-bold text-lg shadow-xs">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-wider text-zinc-100 uppercase block leading-tight">
                Controle Estoque
              </span>
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">
                Módulo Industrial
              </span>
            </div>
          </div>
          <button
            onClick={onFecharMobile}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 lg:hidden"
            aria-label="Fechar navegação lateral"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Links de Navegação */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase font-mono">
            Operacional
          </div>
          {ITENS_MENU.filter((item) => !item.apenasAdmin || isAdmin).map((item) => {
            const Icone = item.icone;
            const ativo = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));


            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onFecharMobile}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors group relative',
                  ativo
                    ? 'bg-zinc-900 text-amber-400 font-semibold border border-zinc-800 shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
                )}
              >
                <Icone className={cn('w-4 h-4 transition-colors', ativo ? 'text-amber-400' : 'text-zinc-500 group-hover:text-zinc-300')} />
                <div className="flex flex-col">
                  <span>{item.nome}</span>
                </div>
                {ativo && (
                  <span className="absolute right-2 w-1.5 h-1.5 rounded-full bg-amber-400" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Rodapé da Sidebar */}
        <div className="p-3 border-t border-zinc-800/80 bg-zinc-950/80">
          <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-2.5 flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">Status do Sistema</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-zinc-300 font-medium">RPCs Conectadas</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
