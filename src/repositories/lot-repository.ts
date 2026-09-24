import { Lote } from '@/types/stock';
import { formatarErroBanco } from '@/lib/utils/error-handler';

/**
 * Repositório para consulta de Lotes de materiais.
 * Migrado para Route Handler server-side (/api/lotes) via Firebase Admin SDK.
 */
export const lotRepository = {
  async listarPorProduto(produtoId: string, apenasComSaldo: boolean = false): Promise<Lote[]> {
    try {
      const params = new URLSearchParams({
        produto_id: produtoId,
        apenas_com_saldo: String(apenasComSaldo),
      });

      const res = await fetch(`/api/lotes?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.erro || 'Erro ao listar lotes do produto.');
      }

      return data as Lote[];
    } catch (error: any) {
      throw new Error(formatarErroBanco(error).mensagem);
    }
  },

  async buscarPorId(loteId: string): Promise<Lote | null> {
    try {
      const res = await fetch(`/api/lotes?id=${encodeURIComponent(loteId)}`);
      if (res.status === 404) {
        return null;
      }
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.erro || 'Erro ao buscar lote.');
      }

      return data as Lote;
    } catch (error: any) {
      throw new Error(formatarErroBanco(error).mensagem);
    }
  },

  async buscarPorNumero(produtoId: string, numeroLote: string): Promise<Lote | null> {
    try {
      const params = new URLSearchParams({
        produto_id: produtoId,
        numero_lote: numeroLote.trim(),
      });

      const res = await fetch(`/api/lotes?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.erro || 'Erro ao buscar lote por número.');
      }

      return data as Lote | null;
    } catch (error: any) {
      throw new Error(formatarErroBanco(error).mensagem);
    }
  },
};
