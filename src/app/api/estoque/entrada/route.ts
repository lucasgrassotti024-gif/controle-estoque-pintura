import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/auth/session';
import { stockServerService } from '@/server/services/stock-server-service';
import { RegistrarEntradaDTO } from '@/types/stock';

/**
 * ==============================================================================
 * ROUTE HANDLER: REGISTRAR ENTRADA DE ESTOQUE (SERVER-SIDE)
 * ==============================================================================
 * POST /api/estoque/entrada
 * Protegido com requirePermission('ESTOQUE_OPERAR').
 * Permite OPERADOR e ADMIN. Rejeita CONSULTA (403) e anônimo (401).
 */
export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'ESTOQUE_OPERAR');
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  try {
    const body = await req.json();

    const dto: RegistrarEntradaDTO = {
      produto_id: String(body.produto_id || ''),
      quantidade: Number(body.quantidade),
      documento_ref: body.documento_ref ? String(body.documento_ref) : undefined,
      motivo_destino: body.motivo_destino ? String(body.motivo_destino) : undefined,
      observacao: body.observacao ? String(body.observacao) : undefined,
      numero_lote: body.numero_lote ? String(body.numero_lote) : undefined,
      data_validade: body.data_validade ? String(body.data_validade) : undefined,
    };

    const resultado = await stockServerService.registrarEntrada(dto, {
      uid: auth.usuario.uid,
      nome: auth.usuario.nome,
    });
    return NextResponse.json(resultado, { status: 200 });


  } catch (error: any) {
    return NextResponse.json(
      { erro: error?.message || 'Erro ao registrar entrada de estoque.' },
      { status: 400 }
    );
  }
}
