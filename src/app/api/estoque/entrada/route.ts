import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/auth/session';
import { stockServerService } from '@/server/services/stock-server-service';
import { RegistrarEntradaDTO } from '@/types/stock';

import { extrairIdempotencyKey } from '@/server/auth/idempotency';

/**
 * ==============================================================================
 * ROUTE HANDLER: REGISTRAR ENTRADA DE ESTOQUE (SERVER-SIDE)
 * ==============================================================================
 * POST /api/estoque/entrada
 * Protegido com requirePermission('ESTOQUE_OPERAR').
 * Permite OPERADOR e ADMIN. Rejeita CONSULTA (403) e anônimo (401).
 * Suporte completo a idempotência e replay atômico (X-Idempotency-Key).
 */
export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'ESTOQUE_OPERAR');
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  try {
    const body = await req.json();
    const idempotencyKey = extrairIdempotencyKey(req, body);

    const dto: RegistrarEntradaDTO = {
      produto_id: String(body.produto_id || ''),
      quantidade: Number(body.quantidade),
      documento_ref: body.documento_ref ? String(body.documento_ref) : undefined,
      motivo_destino: body.motivo_destino ? String(body.motivo_destino) : undefined,
      observacao: body.observacao ? String(body.observacao) : undefined,
      numero_lote: body.numero_lote ? String(body.numero_lote) : undefined,
      data_validade: body.data_validade ? String(body.data_validade) : undefined,
      idempotency_key: idempotencyKey,
      device_id: body.device_id ? String(body.device_id) : undefined,
      local_sequence_number: typeof body.local_sequence_number === 'number' ? body.local_sequence_number : undefined,
    };

    const resultado = await stockServerService.registrarEntrada(dto, {
      uid: auth.usuario.uid,
      nome: auth.usuario.nome,
    });
    return NextResponse.json(resultado, { status: 200 });

  } catch (error: any) {
    const status = error?.statusCode || 400;
    return NextResponse.json(
      { 
        erro: error?.message || 'Erro ao registrar entrada de estoque.',
        codigo: error?.codigo,
        detalhes: error?.detalhes
      },
      { status }
    );
  }
}

