import { 
  RegistrarEntradaDTO, 
  RegistrarSaidaDTO, 
  RegistrarConferenciaDTO,
  ResultadoOperacaoEstoque,
  Movimentacao,
  ConferenciaFisica,
  FiltroMovimentacoesDTO,
  FiltroConferenciasDTO,
  Produto,
  Lote
} from '@/types/stock';
import { formatarErroBanco } from '@/lib/utils/error-handler';

/**
 * ==============================================================================
 * REPOSITÓRIO DE OPERAÇÕES DE ESTOQUE (FIRESTORE ATOMIC TRANSACTIONS)
 * ==============================================================================
 * Assegura conformidade rigorosa com as regras de negócio:
 * 1. Proibição absoluta de saldo negativo.
 * 2. Invariância: Saldo do Produto = Soma dos Lotes (quando controla_lote = true).
 * 3. Atomicidade total em Entrada, Saída e Conferência via runTransaction().
 * 4. Histórico imutável de movimentações (append-only).
 */
export const stockRepository = {
  // ============================================================================
  // OPERAÇÕES TRANSACIONAIS DE MUTAÇÃO (FIRESTORE TRANSACTIONS)
  // ============================================================================

  async registrarEntrada(dto: RegistrarEntradaDTO): Promise<ResultadoOperacaoEstoque> {
    try {
      const res = await fetch('/api/estoque/entrada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.erro || 'Erro ao registrar entrada.');
      }

      return data as ResultadoOperacaoEstoque;
    } catch (error: any) {
      throw new Error(formatarErroBanco(error).mensagem);
    }
  },

  async registrarSaida(dto: RegistrarSaidaDTO): Promise<ResultadoOperacaoEstoque> {
    try {
      const res = await fetch('/api/estoque/saida', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.erro || 'Erro ao registrar saída.');
      }

      return data as ResultadoOperacaoEstoque;
    } catch (error: any) {
      throw new Error(formatarErroBanco(error).mensagem);
    }
  },

  async registrarConferenciaFisica(dto: RegistrarConferenciaDTO): Promise<ResultadoOperacaoEstoque> {
    try {
      const res = await fetch('/api/estoque/conferencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.erro || 'Erro ao registrar conferência física.');
      }

      return data as ResultadoOperacaoEstoque;
    } catch (error: any) {
      throw new Error(formatarErroBanco(error).mensagem);
    }
  },

  // ============================================================================
  // CONSULTAS DE HISTÓRICO (SOMENTE LEITURA VIA SERVER-SIDE ROUTE HANDLERS)
  // ============================================================================

  async listarMovimentacoes(filtro?: FiltroMovimentacoesDTO): Promise<Movimentacao[]> {
    try {
      const params = new URLSearchParams();
      if (filtro?.produto_id) params.set('produto_id', filtro.produto_id);
      if (filtro?.lote_id) params.set('lote_id', filtro.lote_id);
      if (filtro?.tipo) params.set('tipo', filtro.tipo);
      if (filtro?.data_inicio) params.set('data_inicio', filtro.data_inicio);
      if (filtro?.data_fim) params.set('data_fim', filtro.data_fim);
      if (filtro?.limite) params.set('limite', String(filtro.limite));

      const url = `/api/estoque/movimentacoes${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.erro || 'Erro ao listar movimentações.');
      }

      return data as Movimentacao[];
    } catch (error: any) {
      throw new Error(formatarErroBanco(error).mensagem);
    }
  },

  async listarConferenciasFisicas(filtro?: FiltroConferenciasDTO): Promise<ConferenciaFisica[]> {
    try {
      const params = new URLSearchParams();
      if (filtro?.produto_id) params.set('produto_id', filtro.produto_id);
      if (filtro?.lote_id) params.set('lote_id', filtro.lote_id);
      if (filtro?.data_inicio) params.set('data_inicio', filtro.data_inicio);
      if (filtro?.data_fim) params.set('data_fim', filtro.data_fim);
      if (filtro?.limite) params.set('limite', String(filtro.limite));

      const url = `/api/estoque/conferencia${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.erro || 'Erro ao listar conferências físicas.');
      }

      return data as ConferenciaFisica[];
    } catch (error: any) {
      throw new Error(formatarErroBanco(error).mensagem);
    }
  },
};
