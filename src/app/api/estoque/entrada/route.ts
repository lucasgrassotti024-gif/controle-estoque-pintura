import { NextRequest, NextResponse } from 'next/server';
import { stockServerService } from '@/server/services/stock-server-service';
import { RegistrarEntradaDTO } from '@/types/stock';

/**
 * ==============================================================================
 * ROUTE HANDLER: REGISTRAR ENTRADA DE ESTOQUE (SERVER-SIDE)
 * ==============================================================================
 * POST /api/estoque/entrada
 * O cliente envia somente INTENÇÃO de entrada.
 * Nenhum cálculo de saldo enviado pelo cliente é considerado.
 */
export async function POST(req: NextRequest) {
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

    const resultado = await stockServerService.registrarEntrada(dto);
    return NextResponse.json(resultado, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { erro: error?.message || 'Erro ao registrar entrada de estoque.' },
      { status: 400 }
    );
  }
}
