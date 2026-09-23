'use client';

import React, { createContext, useContext, useState } from 'react';
import { Usuario } from '@/types/stock';

/**
 * ==============================================================================
 * AUTH CONTEXT TEMPORÁRIO (FASE 16 - MUDANÇA PARA FIREBASE)
 * ==============================================================================
 * A autenticação pelo Firebase Auth está explicitamente fora do escopo desta fase.
 * O contexto preserva o estado de sessão de desenvolvimento de forma limpa,
 * sem nenhuma chamada a Supabase ou @supabase/supabase-js.
 */

interface AuthContextType {
  usuario: Usuario | null;
  email: string | null;
  carregando: boolean;
  logout: () => Promise<void>;
  autenticado: boolean;
}

const usuarioPadraoDev: Usuario = {
  id: 'usr-dev-master',
  email: 'operador@rss3.com.br',
  nome: 'Operador Almoxarifado',
  papel: 'ADMIN',
  ativo: true,
  criado_em: '2026-09-21T00:00:00Z',
};

const AuthContext = createContext<AuthContextType>({
  usuario: usuarioPadraoDev,
  email: usuarioPadraoDev.email,
  carregando: false,
  logout: async () => {},
  autenticado: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(usuarioPadraoDev);
  const [email, setEmail] = useState<string | null>(usuarioPadraoDev.email);
  const [carregando] = useState(false);

  async function logout() {
    setUsuario(null);
    setEmail(null);
  }

  return (
    <AuthContext.Provider
      value={{
        usuario,
        email,
        carregando,
        logout,
        autenticado: Boolean(usuario || email),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
