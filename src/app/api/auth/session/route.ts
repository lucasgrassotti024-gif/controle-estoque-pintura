import { NextRequest, NextResponse } from 'next/server';
import { 
  criarCookieSessao, 
  getSessionCookieOptions, 
  SESSION_COOKIE_NAME, 
  obterUsuarioSessao 
} from '@/server/auth/session';
import { adminAuth, adminDb } from '@/server/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/firestore';

/**
 * ==============================================================================
 * ROUTE HANDLER: GERENCIAMENTO DE SESSÃO (/api/auth/session)
 * ==============================================================================
 * POST: Cria cookie HTTP-only de sessão a partir do ID Token enviado pelo cliente.
 * GET: Retorna os dados do usuário autenticado a partir do cookie HTTP-only.
 * DELETE: Limpa o cookie de sessão (logout).
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const idToken = body?.idToken;

    if (!idToken || typeof idToken !== 'string') {
      return NextResponse.json({ erro: 'ID Token não fornecido.' }, { status: 400 });
    }

    // 1. Criar session cookie com Firebase Admin
    const sessionCookie = await criarCookieSessao(idToken);

    // 2. Verificar usuário no Auth e checar status no Firestore
    const decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
    const userDocRef = adminDb.collection(COLLECTIONS.USERS).doc(decodedToken.uid);
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      return NextResponse.json(
        { erro: 'Registro de usuário não encontrado no Firestore.' },
        { status: 404 }
      );
    }

    const userData = userDoc.data();
    if (userData?.ativo === false) {
      return NextResponse.json(
        { erro: 'Usuário desativado. Entre em contato com o administrador.' },
        { status: 403 }
      );
    }

    const response = NextResponse.json(
      {
        sucesso: true,
        usuario: {
          id: userDoc.id,
          uid: userDoc.id,
          email: userData?.email || decodedToken.email,
          nome: userData?.nome || 'Usuário',
          papel: userData?.papel || 'CONSULTA',
          ativo: true,
        },
      },
      { status: 200 }
    );

    // 3. Gravar cookie HTTP-only na resposta
    const cookieOptions = getSessionCookieOptions();
    response.cookies.set({
      name: cookieOptions.name,
      value: sessionCookie,
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      path: cookieOptions.path,
      maxAge: cookieOptions.maxAge,
    });

    return response;
  } catch (error: any) {
    return NextResponse.json(
      { erro: error?.message || 'Falha ao autenticar sessão.' },
      { status: 401 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const usuario = await obterUsuarioSessao(req);

    if (!usuario) {
      return NextResponse.json({ usuario: null, autenticado: false }, { status: 200 });
    }

    return NextResponse.json({ usuario, autenticado: true }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ usuario: null, autenticado: false }, { status: 200 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ sucesso: true, mensagem: 'Logout realizado.' }, { status: 200 });

  // Limpa o cookie de sessão
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
