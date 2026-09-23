'use client';

import React, { useState } from 'react';
import { Sidebar } from './sidebar';
import { Header } from './header';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [sidebarAbertaMobile, setSidebarAbertaMobile] = useState(false);

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
