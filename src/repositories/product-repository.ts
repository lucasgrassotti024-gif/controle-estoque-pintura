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
  getCountFromServer 
} from 'firebase/firestore';
import { 
  Produto, 
  CriarProdutoDTO, 
  AtualizarProdutoDTO, 
  FiltroProdutosDTO 
} from '@/types/stock';
import { formatarErroBanco } from '@/lib/utils/error-handler';

/**
 * Repositório de Catálogo de Produtos / Materiais (Firestore).
 * Garante que saldo_atual nunca seja manipulado via UPDATE e que produtos não sejam deletados fisicamente.
 */
export const productRepository = {
  async listar(filtro?: FiltroProdutosDTO): Promise<Produto[]> {
    try {
      const colRef = collection(db, COLLECTIONS.PRODUCTS);
      let q = query(colRef);

      if (filtro?.apenas_ativos !== false) {
        q = query(q, where('ativo', '==', true));
      }

      if (filtro?.categoria) {
        q = query(q, where('categoria', '==', filtro.categoria));
      }

      q = query(q, orderBy('nome', 'asc'));

      const snapshot = await getDocs(q);
      let produtos: Produto[] = snapshot.docs.map((docSnap) => ({
        ...(docSnap.data() as Produto),
        id: docSnap.id,
      }));

      // Filtro de termo em memória (para suportar busca por código ou nome sem complexidade de índices textuais)
      if (filtro?.termo && filtro.termo.trim()) {
        const termo = filtro.termo.trim().toLowerCase();
        produtos = produtos.filter(
          (p) =>
            p.nome.toLowerCase().includes(termo) ||
            p.codigo.toLowerCase().includes(termo)
        );
      }

      return produtos;
    } catch (error: any) {
      throw new Error(formatarErroBanco(error).mensagem);
    }
  },

  async buscarPorId(id: string): Promise<Produto | null> {
    try {
      const docRef = doc(db, COLLECTIONS.PRODUCTS, id);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        return null;
      }

      return {
        ...(docSnap.data() as Produto),
        id: docSnap.id,
      };
    } catch (error: any) {
      throw new Error(formatarErroBanco(error).mensagem);
    }
  },

  async buscarPorCodigo(codigo: string): Promise<Produto | null> {
    try {
      const colRef = collection(db, COLLECTIONS.PRODUCTS);
      const q = query(colRef, where('codigo', '==', codigo.trim()));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return null;
      }

      const docSnap = snapshot.docs[0];
      return {
        ...(docSnap.data() as Produto),
        id: docSnap.id,
      };
    } catch (error: any) {
      throw new Error(formatarErroBanco(error).mensagem);
    }
  },

  async criar(dto: CriarProdutoDTO): Promise<Produto> {
    try {
      const res = await fetch('/api/produtos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.erro || 'Erro ao cadastrar produto.');
      }

      return data as Produto;
    } catch (error: any) {
      throw new Error(formatarErroBanco(error).mensagem);
    }
  },

  async atualizar(id: string, dto: AtualizarProdutoDTO): Promise<Produto> {
    try {
      const res = await fetch('/api/produtos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...dto }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.erro || 'Erro ao atualizar produto.');
      }

      return data as Produto;
    } catch (error: any) {
      throw new Error(formatarErroBanco(error).mensagem);
    }
  },

  async alterarStatusAtivo(id: string, ativo: boolean): Promise<Produto> {
    try {
      const res = await fetch('/api/produtos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ativo }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.erro || 'Erro ao alterar status do produto.');
      }

      return data as Produto;
    } catch (error: any) {
      throw new Error(formatarErroBanco(error).mensagem);
    }
  },

  async verificarDependenciasLote(produtoId: string): Promise<{
    totalLotes: number;
    totalMovimentacoesLote: number;
    totalConferenciasLote: number;
  }> {
    try {
      // 1. Contagem de lotes existentes
      const lotesCol = collection(db, COLLECTIONS.LOTS);
      const qLotes = query(lotesCol, where('produto_id', '==', produtoId));
      const snapLotes = await getCountFromServer(qLotes);
      const countLotes = snapLotes.data().count;

      // 2. Contagem de movimentações que utilizaram lote
      const movCol = collection(db, COLLECTIONS.MOVEMENTS);
      const qMov = query(movCol, where('produto_id', '==', produtoId));
      const snapMov = await getDocs(qMov);
      const countMov = snapMov.docs.filter((d) => d.data().lote_id != null).length;

      // 3. Contagem de conferências que utilizaram lote
      const confCol = collection(db, COLLECTIONS.PHYSICAL_COUNTS);
      const qConf = query(confCol, where('produto_id', '==', produtoId));
      const snapConf = await getDocs(qConf);
      const countConf = snapConf.docs.filter((d) => d.data().lote_id != null).length;

      return {
        totalLotes: countLotes || 0,
        totalMovimentacoesLote: countMov || 0,
        totalConferenciasLote: countConf || 0,
      };
    } catch (error: any) {
      throw new Error(formatarErroBanco(error).mensagem);
    }
  },
};
