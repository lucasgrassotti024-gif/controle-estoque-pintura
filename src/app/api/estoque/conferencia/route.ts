import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/session';
import { stockServerService } from '@/server/services/stock-server-service';
import { RegistrarConferenciaDTO } from '@/types/stock';

/**
 * ==============================================================================
 * ROUTE HANDLER: REGISTRAR E CONSULTAR CONFERÊNCIAS FÍSICAS (SERVER-SIDE)
 * ==============================================================================
 * GET /api/estoque/conferencia -> requireAuth (visualização permitida a todos os papéis autenticados)
 * POST /api/estoque/conferencia -> requirePermission('ESTOQUE_OPERAR') (OPERADOR e ADMIN)
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
    const data_inicio = searchParams.get('data_inicio') || undefined;
    const data_fim = searchParams.get('data_fim') || undefined;
    const limite = searchParams.has('limite') ? Number(searchParams.get('limite')) : undefined;

    const conferencias = await stockServerService.listarConferenciasFisicas({
      produto_id,
      lote_id,
      data_inicio,
      data_fim,
      limite,
    });

    return NextResponse.json(conferencias, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { erro: error?.message || 'Erro ao consultar conferências físicas.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'ESTOQUE_OPERAR');
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  try {
    const body = await req.json();

    const dto: RegistrarConferenciaDTO = {
      produto_id: String(body.produto_id || ''),
      quantidade_encontrada: Number(body.quantidade_encontrada),
      justificativa: body.justificativa ? String(body.justificativa) : undefined,
      observacao: body.observacao ? String(body.observacao) : undefined,
      lote_id: body.lote_id ? String(body.lote_id) : undefined,
    };

    const resultado = await stockServerService.registrarConferenciaFisica(dto, {
      uid: auth.usuario.uid,
      nome: auth.usuario.nome,
    });
    return NextResponse.json(resultado, { status: 200 });

  } catch (error: any) {
    return NextResponse.json(
      { erro: error?.message || 'Erro ao registrar conferência física.' },
      { status: 400 }
    );
  }
}

