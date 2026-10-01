import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/session';
import { stockServerService } from '@/server/services/stock-server-service';

/**
 * ==============================================================================
 * ROUTE HANDLER: CONSULTA DE LOTES (SERVER-SIDE VIA FIREBASE ADMIN SDK)
 * ==============================================================================
 * GET /api/lotes?produto_id=...&apenas_com_saldo=true|false
 * GET /api/lotes?id=...
 * GET /api/lotes?produto_id=...&numero_lote=...
 * Protegido com requireAuth.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  try {
    const { searchParams } = new URL(req.url);

    const id = searchParams.get('id');
    const produtoId = searchParams.get('produto_id');
    const numeroLote = searchParams.get('numero_lote');
    const apenasComSaldo = searchParams.get('apenas_com_saldo') === 'true';

    if (id) {
      const lote = await stockServerService.buscarLotePorId(id);
      if (!lote) {
        return NextResponse.json({ erro: 'Lote não encontrado.' }, { status: 404 });
      }
      return NextResponse.json(lote, { status: 200 });
    }

    if (produtoId && numeroLote) {
      const lote = await stockServerService.buscarLotePorNumero(produtoId, numeroLote);
      return NextResponse.json(lote, { status: 200 });
    }

    if (produtoId) {
      const lotes = await stockServerService.listarLotesPorProduto(produtoId, apenasComSaldo);
      return NextResponse.json(lotes, { status: 200 });
    }

    return NextResponse.json({ erro: 'Parâmetro produto_id ou id é obrigatório.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { erro: error?.message || 'Erro ao consultar lotes.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requirePermission(req, 'ESTOQUE_AJUSTAR');
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ erro: 'ID do lote é obrigatório.' }, { status: 400 });
    }

    const resultado = await stockServerService.excluirLote(id, {
      uid: auth.usuario.uid,
      nome: auth.usuario.nome || 'Administrador',
    });

    return NextResponse.json(resultado, { status: 200 });
  } catch (error: any) {
    const status = error?.statusCode || 400;
    return NextResponse.json(
      { erro: error?.message || 'Erro ao processar exclusão/desativação do lote.' },
      { status }
    );
  }
}
