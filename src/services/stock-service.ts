import { stockRepository } from '@/repositories/stock-repository';
import { productRepository } from '@/repositories/product-repository';
import { lotRepository } from '@/repositories/lot-repository';
import { 
  RegistrarEntradaDTO, 
  RegistrarSaidaDTO, 
  RegistrarConferenciaDTO,
  ResultadoOperacaoEstoque,
  ConsultaEstoqueProduto,
  Movimentacao,
  ConferenciaFisica,
  FiltroMovimentacoesDTO,
  FiltroConferenciasDTO,
  Produto
} from '@/types/stock';
import { calcularSituacaoEstoque } from '@/lib/utils/formatters';

/**
 * Serviço de Domínio para Estoque, Movimentações e Conferências.
 * Orquestra validações prévias e chamadas atômicas ao repositório.
 */
export const stockService = {
  // ============================================================================
  // CONSULTAS DE ESTOQUE E SITUAÇÃO
  // ============================================================================

  async consultarEstoqueProduto(produtoId: string): Promise<ConsultaEstoqueProduto> {
    if (!produtoId || !produtoId.trim()) {
      throw new Error('ID do produto é obrigatório.');
    }

    const produto = await productRepository.buscarPorId(produtoId);
    if (!produto) {
      throw new Error('Produto não encontrado.');
    }

    let lotesAtivos: any[] = [];
    if (produto.controla_lote) {
      lotesAtivos = await lotRepository.listarPorProduto(produtoId, true);
    }

    const situacao = calcularSituacaoEstoque(
      produto.saldo_atual,
      produto.estoque_minimo,
      produto.estoque_maximo
    );

    return {
      produto,
      situacao,
      total_lotes: lotesAtivos.length,
      lotes_ativos: lotesAtivos
    };
  },

  // ============================================================================
  // MUTAÇÕES TRANSACIONAIS (DELEGADAS AO POSTGRESQL/RPCS)
  // ============================================================================

  async darEntrada(dto: RegistrarEntradaDTO, produto?: Produto): Promise<ResultadoOperacaoEstoque> {
    if (!dto.produto_id || !dto.produto_id.trim()) {
      throw new Error('O material/produto é obrigatório.');
    }
    if (typeof dto.quantidade !== 'number' || isNaN(dto.quantidade) || dto.quantidade <= 0) {
      throw new Error('A quantidade de entrada deve ser um número positivo maior que zero.');
    }

    if (produto) {
      if (!produto.ativo) {
        throw new Error('Operação bloqueada: Não é permitido registrar entrada em um produto inativo.');
      }
      if (produto.controla_lote && (!dto.numero_lote || !dto.numero_lote.trim())) {
        throw new Error('Lote obrigatório: este produto exige identificação de lote para entrada.');
      }
      if (!produto.controla_lote && dto.numero_lote && dto.numero_lote.trim()) {
        throw new Error('Este produto não controla lote. O campo de lote deve permanecer vazio.');
      }
    }

    if (dto.data_validade) {
      const dataValida = !isNaN(Date.parse(dto.data_validade));
      if (!dataValida) {
        throw new Error('Data de validade inválida.');
      }
    }

    return await stockRepository.registrarEntrada(dto);
  },

  async darSaida(dto: RegistrarSaidaDTO, produto?: Produto): Promise<ResultadoOperacaoEstoque> {
    if (!dto.produto_id || !dto.produto_id.trim()) {
      throw new Error('O material/produto é obrigatório.');
    }
    if (typeof dto.quantidade !== 'number' || isNaN(dto.quantidade) || dto.quantidade <= 0) {
      throw new Error('A quantidade de saída deve ser um número positivo maior que zero.');
    }

    if (produto) {
      if (!produto.ativo) {
        throw new Error('Operação bloqueada: Não é permitido registrar saída em um produto inativo.');
      }
      if (produto.controla_lote && !dto.lote_id) {
        throw new Error('Lote obrigatório: este produto controla lote. Selecione manualmente o lote de origem.');
      }
      if (!produto.controla_lote && dto.lote_id) {
        throw new Error('Este produto não controla lote. Parâmetro de lote deve ser nulo.');
      }
      if (dto.quantidade > produto.saldo_atual) {
        throw new Error(`Saldo insuficiente no produto. Saldo disponível: ${produto.saldo_atual}, Saída solicitada: ${dto.quantidade}`);
      }
    }

    return await stockRepository.registrarSaida(dto);
  },

  async registrarConferencia(dto: RegistrarConferenciaDTO, produto?: Produto, lote?: any): Promise<ResultadoOperacaoEstoque> {
    if (!dto.produto_id || !dto.produto_id.trim()) {
      throw new Error('O material/produto é obrigatório.');
    }
    if (typeof dto.quantidade_encontrada !== 'number' || isNaN(dto.quantidade_encontrada) || dto.quantidade_encontrada < 0) {
      throw new Error('A quantidade física encontrada não pode ser negativa.');
    }

    if (produto) {
      if (!produto.ativo) {
        throw new Error('Operação bloqueada: Não é permitido registrar conferência física em um produto inativo.');
      }
      if (produto.controla_lote && !dto.lote_id) {
        throw new Error('Lote obrigatório: a conferência de produto com controle de lote deve ser realizada lote por lote.');
      }
      if (!produto.controla_lote && dto.lote_id) {
        throw new Error('Este produto não controla lote. Parâmetro de lote deve ser nulo.');
      }

      // Validação preliminar de justificativa se houver divergência conhecida
      const saldoAnterior = produto.controla_lote && lote ? lote.saldo_lote : produto.saldo_atual;
      const temDivergencia = saldoAnterior !== undefined && dto.quantidade_encontrada !== saldoAnterior;
      if (temDivergencia && (!dto.justificativa || !dto.justificativa.trim())) {
        throw new Error('Justificativa obrigatória: qualquer ajuste com divergência de conferência física exige justificativa.');
      }
    }

    return await stockRepository.registrarConferenciaFisica(dto);
  },

  // ============================================================================
  // CONSULTAS DE HISTÓRICO
  // ============================================================================

  async listarMovimentacoes(filtro?: FiltroMovimentacoesDTO): Promise<Movimentacao[]> {
    return await stockRepository.listarMovimentacoes(filtro);
  },

  async listarConferencias(filtro?: FiltroConferenciasDTO): Promise<ConferenciaFisica[]> {
    return await stockRepository.listarConferenciasFisicas(filtro);
  }
};
