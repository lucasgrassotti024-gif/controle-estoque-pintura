'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Usuario } from '@/types/stock';
import { auth } from '@/lib/firebase/config';
import { 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  onAuthStateChanged 
} from 'firebase/auth';

/**
 * ==============================================================================
 * AUTH CONTEXT OFICIAL - FIREBASE AUTH + HTTP-ONLY SESSION COOKIE + RBAC
 * ==============================================================================
 * Fluxo de autenticação:
 * 1. Login no navegador via Firebase Auth Client (signInWithEmailAndPassword).
 * 2. Obtenção do idToken gerado pelo Firebase.
 * 3. Envio do idToken para /api/auth/session para validação server-side e
 *    geração do cookie de sessão HTTP-only seguro.
 * 4. Carregamento do perfil oficial armazenado em users/{uid}.
 * 5. Logout sincronizado no Firebase Auth e na rota /api/auth/session.
 */

interface AuthContextType {
  usuario: Usuario | null;
  email: string | null;
  carregando: boolean;
  login: (email: string, senha: string) => Promise<{ sucesso: boolean; erro?: string }>;
  logout: () => Promise<void>;
  autenticado: boolean;
  recarregarUsuario: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  usuario: null,
  email: null,
  carregando: true,
  login: async () => ({ sucesso: false }),
  logout: async () => {},
  autenticado: false,
  recarregarUsuario: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  // Consulta a sessão server-side atual (/api/auth/session)
  const verificarSessao = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'same-origin',
      });

      if (res.ok) {
        const data = await res.json();
        if (data.autenticado && data.usuario) {
          setUsuario(data.usuario);
          return;
        }
      }
      setUsuario(null);
    } catch {
      setUsuario(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    verificarSessao();
  }, [verificarSessao]);

  /**
   * Realiza login no cliente, gera ID Token e estabelece cookie de sessão HTTP-only no servidor.
   */
  async function login(email: string, senha: string): Promise<{ sucesso: boolean; erro?: string }> {
    setCarregando(true);
    try {
      // 1. Firebase Auth Client
      const userCredential = await signInWithEmailAndPassword(auth, email, senha);
      const idToken = await userCredential.user.getIdToken();

      // 2. Chamar endpoint server-side para gerar o cookie de sessão HTTP-only e validar usuário
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Se a validação server-side falhou (ex: usuário desativado ou não encontrado), desconectar client
        await firebaseSignOut(auth);
        setUsuario(null);
        return {
          sucesso: false,
          erro: data?.erro || 'Falha ao autenticar sessão no servidor.',
        };
      }

      setUsuario(data.usuario);
      return { sucesso: true };
    } catch (error: any) {
      let msg = 'Erro ao realizar login.';
      if (error?.code === 'auth/user-not-found' || error?.code === 'auth/wrong-password' || error?.code === 'auth/invalid-credential') {
        msg = 'E-mail ou senha inválidos.';
      } else if (error?.code === 'auth/user-disabled') {
        msg = 'Usuário desativado. Entre em contato com o administrador.';
      } else if (error?.code === 'auth/too-many-requests') {
        msg = 'Muitas tentativas sem sucesso. Tente novamente mais tarde.';
      } else if (error?.message) {
        msg = error.message;
      }

      setUsuario(null);
      return { sucesso: false, erro: msg };
    } finally {
      setCarregando(false);
    }
  }

  /**
   * Encerra a sessão tanto no cliente Firebase quanto no cookie HTTP-only do servidor.
   */
  async function logout() {
    setCarregando(true);
    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
      await firebaseSignOut(auth);
    } catch (err) {
      console.error('Erro ao efetuar logout:', err);
    } finally {
      setUsuario(null);
      setCarregando(false);
      window.location.href = '/login';
    }
  }

  return (
    <AuthContext.Provider
      value={{
        usuario,
        email: usuario?.email || null,
        carregando,
        login,
        logout,
        autenticado: Boolean(usuario),
        recarregarUsuario: verificarSessao,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
