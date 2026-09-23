import { NextRequest, NextResponse } from 'next/server';
import { stockServerService } from '@/server/services/stock-server-service';
import { RegistrarConferenciaDTO } from '@/types/stock';

/**
 * ==============================================================================
 * ROUTE HANDLER: REGISTRAR CONFERÊNCIA FÍSICA E AJUSTES (SERVER-SIDE)
 * ==============================================================================
 * POST /api/estoque/conferencia
 * O cliente envia somente quantidade física contada e justificativa.
 * Diferença e tipo de ajuste são calculados exclusivamente no servidor.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const dto: RegistrarConferenciaDTO = {
      produto_id: String(body.produto_id || ''),
      quantidade_encontrada: Number(body.quantidade_encontrada),
      justificativa: body.justificativa ? String(body.justificativa) : undefined,
      observacao: body.observacao ? String(body.observacao) : undefined,
      lote_id: body.lote_id ? String(body.lote_id) : undefined,
    };

    const resultado = await stockServerService.registrarConferenciaFisica(dto);
    return NextResponse.json(resultado, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { erro: error?.message || 'Erro ao registrar conferência física.' },
      { status: 400 }
    );
  }
}
