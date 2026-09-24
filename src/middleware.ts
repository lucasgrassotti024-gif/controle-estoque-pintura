import { NextRequest, NextResponse } from 'next/server';

/**
 * ==============================================================================
 * MIDDLEWARE DE AUTENTICAÇÃO E ROTEAMENTO SEGURO
 * ==============================================================================
 * Protege rotas do sistema garantindo:
 * 1. Visitante NÃO autenticado (sem cookie __session) acessando / ou rotas do sistema:
 *    -> Redirecionamento estrito para /login
 * 2. Usuário autenticado acessando /:
 *    -> Redirecionamento para /estoque
 * 3. Usuário autenticado acessando /login:
 *    -> Redirecionamento para /estoque
 * 4. Rotas de API públicas de autenticação, arquivos estáticos e _next são ignorados.
 */

const ROTAS_PUBLICAS = ['/login'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get('__session')?.value;
  const isAutenticado = Boolean(sessionCookie && sessionCookie.trim().length > 0);

  // Raiz do sistema (/)
  if (pathname === '/') {
    if (isAutenticado) {
      return NextResponse.redirect(new URL('/estoque', request.url));
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Página de login (/login)
  if (ROTAS_PUBLICAS.includes(pathname)) {
    if (isAutenticado) {
      return NextResponse.redirect(new URL('/estoque', request.url));
    }
    return NextResponse.next();
  }

  // Demais páginas da aplicação (/estoque, /produtos, /movimentacoes, /conferencias, /usuarios, etc.)
  if (!isAutenticado) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Aplica o middleware em todas as páginas, exceto:
     * - api/ (rotas de API possuem suas próprias guards com requireAuth/requirePermission)
     * - _next/static (arquivos estáticos de build)
     * - _next/image (otimização de imagens)
     * - favicon.ico, sitemap.xml, robots.txt, assets públicos
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
