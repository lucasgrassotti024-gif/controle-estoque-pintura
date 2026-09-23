import { lotRepository } from '@/repositories/lot-repository';
import { Lote } from '@/types/stock';

/**
 * Serviço de Domínio para Lotes.
 * Realiza consultas e validações de leitura para lotes de produtos.
 */
export const lotService = {
  async listarPorProduto(produtoId: string, apenasComSaldo: boolean = false): Promise<Lote[]> {
    if (!produtoId || !produtoId.trim()) {
      throw new Error('ID do produto é obrigatório.');
    }
    return await lotRepository.listarPorProduto(produtoId, apenasComSaldo);
  },

  async buscarPorId(loteId: string): Promise<Lote> {
    if (!loteId || !loteId.trim()) {
      throw new Error('ID do lote é obrigatório.');
    }
    const lote = await lotRepository.buscarPorId(loteId);
    if (!lote) {
      throw new Error('Lote não encontrado.');
    }
    return lote;
  }
};
