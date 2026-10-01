import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Endpoint público de verificação de integridade operacional (Health Check).
 * 
 * Requisitos:
 * - GET público sem exigência de autenticação ou tokens.
 * - Não consulta Firestore nem Firebase Admin.
 * - Não altera banco de dados.
 * - Não expõe secrets, variáveis de ambiente, UIDs, e-mails ou informações internas.
 * - Retorna HTTP 200 com payload mínimo { status: "ok", timestamp: <Date.now()> }.
 * - Cache desabilitado via cabeçalho Cache-Control para garantir respostas frescas.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      timestamp: Date.now()
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
      }
    }
  );
}
