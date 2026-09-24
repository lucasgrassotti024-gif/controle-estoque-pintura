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
      const params = new URLSearchParams();
      if (filtro?.apenas_ativos !== undefined) {
        params.set('apenas_ativos', String(filtro.apenas_ativos));
      }
      if (filtro?.categoria) {
        params.set('categoria', filtro.categoria);
      }
      if (filtro?.termo && filtro.termo.trim()) {
        params.set('termo', filtro.termo.trim());
      }
      if (filtro?.apenas_criticos) {
        params.set('apenas_criticos', 'true');
      }

      const url = `/api/produtos${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.erro || 'Erro ao listar produtos.');
      }

      return data as Produto[];
    } catch (error: any) {
      throw new Error(formatarErroBanco(error).mensagem);
    }
  },

  async buscarPorId(id: string): Promise<Produto | null> {
    try {
      const res = await fetch(`/api/produtos?id=${encodeURIComponent(id)}`);
      if (res.status === 404) {
        return null;
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.erro || 'Erro ao buscar produto.');
      }
      return data as Produto;
    } catch (error: any) {
      throw new Error(formatarErroBanco(error).mensagem);
    }
  },

  async buscarPorCodigo(codigo: string): Promise<Produto | null> {
    try {
      const res = await fetch(`/api/produtos?codigo=${encodeURIComponent(codigo)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.erro || 'Erro ao buscar produto por código.');
      }
      return data as Produto | null;
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
      const res = await fetch(`/api/produtos?dependencias_lote=${encodeURIComponent(produtoId)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.erro || 'Erro ao verificar dependências de lote.');
      }
      return data;
    } catch (error: any) {
      throw new Error(formatarErroBanco(error).mensagem);
    }
  },
};
