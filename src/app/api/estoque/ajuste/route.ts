import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/auth/session';
import { stockServerService } from '@/server/services/stock-server-service';
import { extrairIdempotencyKey } from '@/server/auth/idempotency';
import { RegistrarAjusteEstoqueDTO } from '@/types/stock';

export const dynamic = 'force-dynamic';

/**
 * ==============================================================================
 * ROUTE HANDLER: AJUSTE ADMINISTRATIVO DE ESTOQUE (SERVER-SIDE)
 * ==============================================================================
 * POST /api/estoque/ajuste
 * 
 * Regras estritas:
 * - Exclusivo para perfil ADMIN (requirePermission 'ESTOQUE_AJUSTAR').
 * - CONSULTA e OPERADOR recebem HTTP 403.
 * - Identidade e autoridade do executor extraídas exclusivamente da sessão server-side.
 * - Justificativa obrigatória.
 * - Atualiza produto/lote, grava movimentação append-only, gera audit_logs e respeita idempotência.
 */
export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'ESTOQUE_AJUSTAR');
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  try {
    const body = await req.json();
    const idempotencyKey = extrairIdempotencyKey(req, body);

    const dto: RegistrarAjusteEstoqueDTO = {
      produto_id: String(body.produto_id || ''),
      novo_saldo: Number(body.novo_saldo),
      justificativa: String(body.justificativa || ''),
      lote_id: body.lote_id ? String(body.lote_id) : undefined,
      observacao: body.observacao ? String(body.observacao) : undefined,
      idempotency_key: idempotencyKey,
      device_id: body.device_id ? String(body.device_id) : undefined,
      local_sequence_number: body.local_sequence_number ? Number(body.local_sequence_number) : undefined,
      snapshot_version_produto: body.snapshot_version_produto !== undefined ? Number(body.snapshot_version_produto) : undefined,
      snapshot_version_lote: body.snapshot_version_lote !== undefined ? Number(body.snapshot_version_lote) : undefined,
    };

    const resultado = await stockServerService.registrarAjusteEstoque(dto, {
      uid: auth.usuario.uid,
      nome: auth.usuario.nome || 'Administrador',
    });

    return NextResponse.json(resultado, { status: 200 });
  } catch (error: any) {
    const status = error?.statusCode || 400;
    return NextResponse.json(
      {
        sucesso: false,
        erro: error?.message || 'Erro ao processar ajuste de estoque.',
        codigo: error?.codigo,
        detalhes: error?.detalhes,
      },
      { status }
    );
  }
}
