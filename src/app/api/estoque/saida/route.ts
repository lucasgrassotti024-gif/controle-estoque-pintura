import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/auth/session';
import { stockServerService } from '@/server/services/stock-server-service';
import { RegistrarSaidaDTO } from '@/types/stock';

import { extrairIdempotencyKey } from '@/server/auth/idempotency';

/**
 * ==============================================================================
 * ROUTE HANDLER: REGISTRAR SAÍDA DE ESTOQUE (SERVER-SIDE)
 * ==============================================================================
 * POST /api/estoque/saida
 * Protegido com requirePermission('ESTOQUE_OPERAR').
 * Saldo nunca negativo é estritamente garantido no servidor.
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

    const dto: RegistrarSaidaDTO = {
      produto_id: String(body.produto_id || ''),
      quantidade: Number(body.quantidade),
      documento_ref: body.documento_ref ? String(body.documento_ref) : undefined,
      motivo_destino: body.motivo_destino ? String(body.motivo_destino) : undefined,
      observacao: body.observacao ? String(body.observacao) : undefined,
      lote_id: body.lote_id ? String(body.lote_id) : undefined,
      idempotency_key: idempotencyKey,
      device_id: body.device_id ? String(body.device_id) : undefined,
      local_sequence_number: typeof body.local_sequence_number === 'number' ? body.local_sequence_number : undefined,
      snapshot_version_produto: typeof body.snapshot_version_produto === 'number' ? body.snapshot_version_produto : undefined,
      snapshot_version_lote: typeof body.snapshot_version_lote === 'number' ? body.snapshot_version_lote : undefined,
    };

    const resultado = await stockServerService.registrarSaida(dto, {
      uid: auth.usuario.uid,
      nome: auth.usuario.nome,
    });
    return NextResponse.json(resultado, { status: 200 });

  } catch (error: any) {
    const status = error?.statusCode || 400;
    return NextResponse.json(
      { 
        erro: error?.message || 'Erro ao registrar saída de estoque.',
        codigo: error?.codigo,
        detalhes: error?.detalhes
      },
      { status }
    );
  }
}

