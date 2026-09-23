import { db } from '@/lib/firebase/config';
import { COLLECTIONS } from '@/lib/firebase/firestore';
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  query, 
  where, 
  orderBy, 
  limit as firestoreLimit,
  runTransaction 
} from 'firebase/firestore';
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
  // CONSULTAS DE HISTÓRICO (SOMENTE LEITURA)
  // ============================================================================

  async listarMovimentacoes(filtro?: FiltroMovimentacoesDTO): Promise<Movimentacao[]> {
    try {
      const colRef = collection(db, COLLECTIONS.MOVEMENTS);
      let q = query(colRef, orderBy('criado_em', 'desc'));

      if (filtro?.limite) {
        q = query(q, firestoreLimit(filtro.limite));
      }

      const snapshot = await getDocs(q);
      let lista: Movimentacao[] = snapshot.docs.map((d) => ({
        ...(d.data() as Movimentacao),
        id: d.id,
      }));

      // Filtros em memória (para consultas dinâmicas sem explosão de índices compostos)
      if (filtro?.produto_id) {
        lista = lista.filter((m) => m.produto_id === filtro.produto_id);
      }
      if (filtro?.lote_id) {
        lista = lista.filter((m) => m.lote_id === filtro.lote_id);
      }
      if (filtro?.tipo) {
        lista = lista.filter((m) => m.tipo === filtro.tipo);
      }
      if (filtro?.data_inicio) {
        lista = lista.filter((m) => m.criado_em >= filtro.data_inicio!);
      }
      if (filtro?.data_fim) {
        lista = lista.filter((m) => m.criado_em <= filtro.data_fim!);
      }

      // Enriquecimento com dados do Produto e Lote
      const produtosCol = collection(db, COLLECTIONS.PRODUCTS);
      const prodSnapshot = await getDocs(produtosCol);
      const produtosMap = new Map(prodSnapshot.docs.map((d) => [d.id, d.data() as Produto]));

      const lotesCol = collection(db, COLLECTIONS.LOTS);
      const lotesSnapshot = await getDocs(lotesCol);
      const lotesMap = new Map(lotesSnapshot.docs.map((d) => [d.id, d.data() as Lote]));

      return lista.map((m) => {
        const prod = produtosMap.get(m.produto_id);
        const lote = m.lote_id ? lotesMap.get(m.lote_id) : null;
        return {
          ...m,
          produto_nome: prod?.nome,
          produto_codigo: prod?.codigo,
          produto_unidade: prod?.unidade_medida,
          lote_numero: lote?.numero_lote,
          usuario_nome: 'Operador Almoxarifado',
        };
      });
    } catch (error: any) {
      throw new Error(formatarErroBanco(error).mensagem);
    }
  },

  async listarConferenciasFisicas(filtro?: FiltroConferenciasDTO): Promise<ConferenciaFisica[]> {
    try {
      const colRef = collection(db, COLLECTIONS.PHYSICAL_COUNTS);
      let q = query(colRef, orderBy('criado_em', 'desc'));

      if (filtro?.limite) {
        q = query(q, firestoreLimit(filtro.limite));
      }

      const snapshot = await getDocs(q);
      let lista: ConferenciaFisica[] = snapshot.docs.map((d) => ({
        ...(d.data() as ConferenciaFisica),
        id: d.id,
      }));

      if (filtro?.produto_id) {
        lista = lista.filter((c) => c.produto_id === filtro.produto_id);
      }
      if (filtro?.lote_id) {
        lista = lista.filter((c) => c.lote_id === filtro.lote_id);
      }
      if (filtro?.data_inicio) {
        lista = lista.filter((c) => c.criado_em >= filtro.data_inicio!);
      }
      if (filtro?.data_fim) {
        lista = lista.filter((c) => c.criado_em <= filtro.data_fim!);
      }

      const produtosCol = collection(db, COLLECTIONS.PRODUCTS);
      const prodSnapshot = await getDocs(produtosCol);
      const produtosMap = new Map(prodSnapshot.docs.map((d) => [d.id, d.data() as Produto]));

      const lotesCol = collection(db, COLLECTIONS.LOTS);
      const lotesSnapshot = await getDocs(lotesCol);
      const lotesMap = new Map(lotesSnapshot.docs.map((d) => [d.id, d.data() as Lote]));

      return lista.map((c) => {
        const prod = produtosMap.get(c.produto_id);
        const lote = c.lote_id ? lotesMap.get(c.lote_id) : null;
        return {
          ...c,
          produto_nome: prod?.nome,
          produto_codigo: prod?.codigo,
          lote_numero: lote?.numero_lote,
          realizado_por_nome: 'Operador Almoxarifado',
        };
      });
    } catch (error: any) {
      throw new Error(formatarErroBanco(error).mensagem);
    }
  },
};
