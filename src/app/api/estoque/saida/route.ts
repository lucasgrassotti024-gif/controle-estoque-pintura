import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/auth/session';
import { stockServerService } from '@/server/services/stock-server-service';
import { RegistrarSaidaDTO } from '@/types/stock';

/**
 * ==============================================================================
 * ROUTE HANDLER: REGISTRAR SAÍDA DE ESTOQUE (SERVER-SIDE)
 * ==============================================================================
 * POST /api/estoque/saida
 * Protegido com requirePermission('ESTOQUE_OPERAR').
 * Saldo nunca negativo é estritamente garantido no servidor.
 */
export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'ESTOQUE_OPERAR');
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  try {
    const body = await req.json();

    const dto: RegistrarSaidaDTO = {
      produto_id: String(body.produto_id || ''),
      quantidade: Number(body.quantidade),
      documento_ref: body.documento_ref ? String(body.documento_ref) : undefined,
      motivo_destino: body.motivo_destino ? String(body.motivo_destino) : undefined,
      observacao: body.observacao ? String(body.observacao) : undefined,
      lote_id: body.lote_id ? String(body.lote_id) : undefined,
    };

    const resultado = await stockServerService.registrarSaida(dto, {
      uid: auth.usuario.uid,
      nome: auth.usuario.nome,
    });
    return NextResponse.json(resultado, { status: 200 });


  } catch (error: any) {
    return NextResponse.json(
      { erro: error?.message || 'Erro ao registrar saída de estoque.' },
      { status: 400 }
    );
  }
}
