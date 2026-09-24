import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/server/auth/session';
import { stockServerService } from '@/server/services/stock-server-service';

/**
 * ==============================================================================
 * ROUTE HANDLER: CONSULTA DE MOVIMENTAÇÕES (SERVER-SIDE VIA FIREBASE ADMIN SDK)
 * ==============================================================================
 * GET /api/estoque/movimentacoes
 * Protegido com requireAuth (leitura permitida a todos os papéis autenticados).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  try {
    const { searchParams } = new URL(req.url);

    const produto_id = searchParams.get('produto_id') || undefined;
    const lote_id = searchParams.get('lote_id') || undefined;
    const tipo = (searchParams.get('tipo') as any) || undefined;
    const data_inicio = searchParams.get('data_inicio') || undefined;
    const data_fim = searchParams.get('data_fim') || undefined;
    const limite = searchParams.has('limite') ? Number(searchParams.get('limite')) : undefined;

    const movimentacoes = await stockServerService.listarMovimentacoes({
      produto_id,
      lote_id,
      tipo,
      data_inicio,
      data_fim,
      limite,
    });

    return NextResponse.json(movimentacoes, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { erro: error?.message || 'Erro ao consultar movimentações.' },
      { status: 500 }
    );
  }
}
