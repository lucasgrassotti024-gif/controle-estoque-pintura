import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/server/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/firestore';
import { Usuario, PapelUsuario, PermissaoSistema } from '@/types/stock';

/**
 * ==============================================================================
 * GERENCIAMENTO DE SESSÃO SERVER-SIDE (HTTP-ONLY COOKIE) & RBAC
 * ==============================================================================
 * 
 * Arquitetura:
 * Browser → Firebase Client SDK (Email/Senha) → ID Token
 * ID Token → Next.js API (/api/auth/session) → adminAuth.createSessionCookie()
 * Cookie HTTP-only (__session) gravado no navegador com flags seguras.
 * 
 * Regras de Autorização:
 * Exatamente 3 papéis:
 * 1. CONSULTA: Leitura geral. Proibido de qualquer escrita/operação.
 * 2. OPERADOR: Visualização + Entradas, Saídas, Conferências e Gestão de Produtos.
 * 3. ADMIN: Acesso total (OPERADOR + Gestão de Usuários).
 */

export const SESSION_COOKIE_NAME = '__session';
// Duração de 5 dias em segundos e milissegundos
export const SESSION_EXPIRATION_MS = 60 * 60 * 24 * 5 * 1000;
export const SESSION_EXPIRATION_SECONDS = 60 * 60 * 24 * 5;

// Mapeamento oficial de permissões por papel
export const MATRIZ_PERMISSOES: Record<PermissaoSistema, readonly PapelUsuario[]> = {
  ESTOQUE_VISUALIZAR: ['CONSULTA', 'OPERADOR', 'ADMIN'],
  ESTOQUE_OPERAR: ['OPERADOR', 'ADMIN'],
  PRODUTO_GERENCIAR: ['OPERADOR', 'ADMIN'],
  USUARIO_GERENCIAR: ['ADMIN'],
};

/**
 * Verifica se um papel específico possui a permissão requerida.
 */
export function temPermissao(papel: PapelUsuario, permissao: PermissaoSistema): boolean {
  const permitidos = MATRIZ_PERMISSOES[permissao];
  return Boolean(permitidos && permitidos.includes(papel));
}

/**
 * Configura as opções do cookie de sessão HTTP-only.
 */
export function getSessionCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_EXPIRATION_SECONDS,
  };
}

/**
 * Cria o cookie de sessão do Firebase a partir de um ID Token fornecido pelo cliente.
 */
export async function criarCookieSessao(idToken: string): Promise<string> {
  return await adminAuth.createSessionCookie(idToken, {
    expiresIn: SESSION_EXPIRATION_MS,
  });
}

/**
 * Obtém os dados completos do usuário autenticado no Firestore a partir da requisição.
 * Valida a assinatura criptográfica da sessão com o Firebase Admin e verifica se o
 * usuário está ativo no Firestore.
 */
export async function obterUsuarioSessao(req: NextRequest): Promise<Usuario | null> {
  try {
    const cookie = req.cookies.get(SESSION_COOKIE_NAME);
    if (!cookie || !cookie.value) {
      return null;
    }

    // 1. Validar e decodificar Session Cookie via Firebase Admin
    const decodedClaims = await adminAuth.verifySessionCookie(cookie.value, true);
    if (!decodedClaims || !decodedClaims.uid) {
      return null;
    }

    // 2. Buscar documento do usuário em users/{uid}
    const userDocRef = adminDb.collection(COLLECTIONS.USERS).doc(decodedClaims.uid);
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      return null;
    }

    const data = userDoc.data();
    if (!data) {
      return null;
    }

    // 3. Validar se o usuário está ativo
    if (data.ativo === false) {
      return null;
    }

    // 4. Mapear usuário com papel oficial
    const papelValido: PapelUsuario = (data.papel === 'ADMIN' || data.papel === 'OPERADOR' || data.papel === 'CONSULTA')
      ? data.papel
      : 'CONSULTA';

    const usuario: Usuario = {
      id: userDoc.id,
      uid: userDoc.id,
      email: data.email || decodedClaims.email || '',
      nome: data.nome || decodedClaims.name || 'Usuário',
      papel: papelValido,
      ativo: Boolean(data.ativo !== false),
      criadoEm: data.criadoEm || data.criado_em,
      atualizadoEm: data.atualizadoEm || data.atualizado_em,
    };

    return usuario;
  } catch (error) {
    // Cookie inválido, expirado ou revogado
    return null;
  }
}

/**
 * Guarda central: Exige que a requisição venha de um usuário autenticado e ativo.
 * Retorna o objeto Usuario ou uma NextResponse com status 401.
 */
export async function requireAuth(req: NextRequest): Promise<{ usuario: Usuario } | { errorResponse: NextResponse }> {
  const usuario = await obterUsuarioSessao(req);

  if (!usuario) {
    return {
      errorResponse: NextResponse.json(
        { erro: 'Não autenticado ou sessão inválida. Faça login para continuar.' },
        { status: 401 }
      ),
    };
  }

  return { usuario };
}

/**
 * Guarda central: Exige que o usuário autenticado tenha permissão para a operação.
 * Retorna status 401 se não logado, ou 403 se o perfil não tiver permissão.
 */
export async function requirePermission(
  req: NextRequest,
  permissao: PermissaoSistema
): Promise<{ usuario: Usuario } | { errorResponse: NextResponse }> {
  const authResult = await requireAuth(req);

  if ('errorResponse' in authResult) {
    return authResult;
  }

  const { usuario } = authResult;

  if (!temPermissao(usuario.papel, permissao)) {
    return {
      errorResponse: NextResponse.json(
        {
          erro: `Acesso negado: o perfil ${usuario.papel} não possui a permissão '${permissao}'.`,
        },
        { status: 403 }
      ),
    };
  }

  return { usuario };
}
