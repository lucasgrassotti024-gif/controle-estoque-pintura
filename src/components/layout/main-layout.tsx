'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { useAuth } from '@/contexts/auth-context';
import { Loader2 } from 'lucide-react';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [sidebarAbertaMobile, setSidebarAbertaMobile] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { autenticado, carregando } = useAuth();

  const isLoginPage = pathname === '/login';

  useEffect(() => {
    if (!carregando) {
      if (!autenticado && !isLoginPage) {
        router.push('/login');
      } else if (autenticado && isLoginPage) {
        router.push('/estoque');
      }
    }
  }, [autenticado, carregando, isLoginPage, router]);

  // Na página de login, renderiza sem Sidebar e Header
  if (isLoginPage) {
    return <>{children}</>;
  }

  // Enquanto valida a sessão inicial
  if (carregando) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
        <span className="text-sm font-mono tracking-wider uppercase text-zinc-400">Verificando credenciais...</span>
      </div>
    );
  }

  // Se não estiver autenticado e não for login, não renderiza o painel enquanto o redirect ocorre
  if (!autenticado) {
    return null;
  }

  return (
    <div className="min-h-screen flex bg-zinc-950 text-zinc-100 font-sans">
      {/* Sidebar Fixa / Responsiva */}
      <Sidebar 
        abertoNoMobile={sidebarAbertaMobile} 
        onFecharMobile={() => setSidebarAbertaMobile(false)} 
      />

      {/* Área Central com Header e Conteúdo */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header onAbrirMobile={() => setSidebarAbertaMobile(true)} />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

