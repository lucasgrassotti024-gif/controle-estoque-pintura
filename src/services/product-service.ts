import { productRepository } from '@/repositories/product-repository';
import { 
  Produto, 
  CriarProdutoDTO, 
  AtualizarProdutoDTO, 
  FiltroProdutosDTO,
  CATEGORIAS_VALIDAS,
  UNIDADES_VALIDAS
} from '@/types/stock';

/**
 * Serviço de Domínio para Produtos/Materiais.
 * Valida regras de negócio cadastrais antes de invocar o repositório.
 */
export const productService = {
  async listar(filtro?: FiltroProdutosDTO): Promise<Produto[]> {
    return await productRepository.listar(filtro);
  },

  async buscarPorId(id: string): Promise<Produto> {
    if (!id || !id.trim()) {
      throw new Error('ID do produto é obrigatório.');
    }
    const produto = await productRepository.buscarPorId(id);
    if (!produto) {
      throw new Error('Produto não encontrado.');
    }
    return produto;
  },

  async buscarPorCodigo(codigo: string): Promise<Produto | null> {
    if (!codigo || !codigo.trim()) {
      throw new Error('Código do produto é obrigatório.');
    }
    return await productRepository.buscarPorCodigo(codigo);
  },

  async criar(dto: CriarProdutoDTO): Promise<Produto> {
    if (!dto.codigo || !dto.codigo.trim()) {
      throw new Error('Código do produto é obrigatório.');
    }
    if (!dto.nome || !dto.nome.trim()) {
      throw new Error('Nome do produto é obrigatório.');
    }
    if (!CATEGORIAS_VALIDAS.includes(dto.categoria)) {
      throw new Error(`Categoria inválida: "${dto.categoria}". Categorias permitidas: ${CATEGORIAS_VALIDAS.join(', ')}`);
    }
    if (!UNIDADES_VALIDAS.includes(dto.unidade_medida)) {
      throw new Error(`Unidade de medida inválida: "${dto.unidade_medida}". Unidades permitidas: ${UNIDADES_VALIDAS.join(', ')}`);
    }
    if (dto.estoque_minimo !== undefined && dto.estoque_minimo < 0) {
      throw new Error('Estoque mínimo não pode ser negativo.');
    }
    if (dto.estoque_maximo !== undefined && dto.estoque_maximo < 0) {
      throw new Error('Estoque máximo não pode ser negativo.');
    }
    if (dto.estoque_maximo !== undefined && dto.estoque_minimo !== undefined && dto.estoque_maximo > 0) {
      if (dto.estoque_maximo < dto.estoque_minimo) {
        throw new Error('Estoque máximo não pode ser menor que o estoque mínimo.');
      }
    }

    return await productRepository.criar(dto);
  },

  async atualizar(id: string, dto: AtualizarProdutoDTO): Promise<Produto> {
    if (!id || !id.trim()) {
      throw new Error('ID do produto é obrigatório.');
    }
    if (dto.categoria && !CATEGORIAS_VALIDAS.includes(dto.categoria)) {
      throw new Error(`Categoria inválida: "${dto.categoria}".`);
    }
    if (dto.unidade_medida && !UNIDADES_VALIDAS.includes(dto.unidade_medida)) {
      throw new Error(`Unidade de medida inválida: "${dto.unidade_medida}".`);
    }
    if (dto.estoque_minimo !== undefined && dto.estoque_minimo < 0) {
      throw new Error('Estoque mínimo não pode ser negativo.');
    }
    if (dto.estoque_maximo !== undefined && dto.estoque_maximo < 0) {
      throw new Error('Estoque máximo não pode ser negativo.');
    }

    // Validação estrita de integridade para alteração de controla_lote
    if (dto.controla_lote !== undefined) {
      const produtoAtual = await productRepository.buscarPorId(id);
      if (produtoAtual && produtoAtual.controla_lote !== dto.controla_lote) {
        // Regra A: Bloqueio absoluto se o produto possuir saldo atual > 0 (em qualquer sentido de alteração)
        if (produtoAtual.saldo_atual > 0) {
          throw new Error(
            `Não é permitido alterar o controle de lote de um material que possui saldo em estoque (${produtoAtual.saldo_atual} ${produtoAtual.unidade_medida}). O saldo precisa ser zerado antes de alterar a modalidade de lote.`
          );
        }

        // Regra B: Transição de TRUE -> FALSE (desativação do controle de lote)
        // Não é permitida simplesmente porque o saldo está zerado se houver histórico ou lotes vinculados.
        if (produtoAtual.controla_lote === true && dto.controla_lote === false) {
          const dependencias = await productRepository.verificarDependenciasLote(id);

          if (dependencias.totalLotes > 0) {
            throw new Error(
              `Operação bloqueada: Este material possui ${dependencias.totalLotes} lote(s) cadastrado(s). Não é permitido desativar o controle de lote de um produto com lotes vinculados para preservar a integridade histórica.`
            );
          }

          if (dependencias.totalMovimentacoesLote > 0) {
            throw new Error(
              `Operação bloqueada: Este material possui histórico de ${dependencias.totalMovimentacoesLote} movimentação(ões) com rastreabilidade de lote. Não é permitido desativar o controle de lote para manter a coerência do livro-razão.`
            );
          }

          if (dependencias.totalConferenciasLote > 0) {
            throw new Error(
              `Operação bloqueada: Este material possui ${dependencias.totalConferenciasLote} conferência(s) física(s) auditada(s) por lote. Não é permitido desativar o controle de lote.`
            );
          }
        }
      }
    }

    return await productRepository.atualizar(id, dto);
  },

  async alternarStatus(id: string, ativo: boolean): Promise<Produto> {
    if (!id || !id.trim()) {
      throw new Error('ID do produto é obrigatório.');
    }
    return await productRepository.alterarStatusAtivo(id, ativo);
  }
};
