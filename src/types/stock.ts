/**
 * Tipagem estrita de Domínio, Banco de Dados, DTOs e Filtros para o Sistema de Controle de Estoque.
 * Projeto isolado e novo.
 */

export type PapelUsuario = 'ADMIN' | 'GESTOR' | 'OPERADOR' | 'CONSULTA';

export type CategoriaProduto = 
  | 'Tintas' 
  | 'Solventes' 
  | 'Abrasivos' 
  | 'EPIs' 
  | 'Embalagens' 
  | 'Outros';

export const CATEGORIAS_VALIDAS: readonly CategoriaProduto[] = [
  'Tintas',
  'Solventes',
  'Abrasivos',
  'EPIs',
  'Embalagens',
  'Outros'
] as const;

export type UnidadeMedida = 
  | 'UN' 
  | 'KG' 
  | 'G' 
  | 'L' 
  | 'ML' 
  | 'M' 
  | 'M²' 
  | 'M³' 
  | 'CX' 
  | 'SC';

export const UNIDADES_VALIDAS: readonly UnidadeMedida[] = [
  'UN',
  'KG',
  'G',
  'L',
  'ML',
  'M',
  'M²',
  'M³',
  'CX',
  'SC'
] as const;

export type TipoMovimentacao = 
  | 'ENTRADA' 
  | 'SAIDA' 
  | 'AJUSTE_ENTRADA' 
  | 'AJUSTE_SAIDA' 
  | 'CONFERENCIA_FISICA';

export type StatusInventario = 'ABERTO' | 'EM_CONTAGEM' | 'CONCLUIDO' | 'CANCELADO';

export type SituacaoEstoque = 
  | 'SEM_ESTOQUE' 
  | 'ABAIXO_DO_MINIMO' 
  | 'PROXIMO_DO_MINIMO' 
  | 'NORMAL' 
  | 'ACIMA_DO_MAXIMO';

// ==============================================================================
// ENTIDADES DO BANCO DE DADOS
// ==============================================================================

export interface Usuario {
  id: string;
  email: string;
  nome: string;
  papel: PapelUsuario;
  ativo: boolean;
  criado_em: string;
}

export interface Produto {
  id: string;
  codigo: string;
  nome: string;
  descricao?: string | null;
  categoria: CategoriaProduto;
  unidade_medida: UnidadeMedida;
  fabricante?: string | null;
  localizacao?: string | null;
  controla_lote: boolean;
  estoque_minimo: number;
  estoque_maximo: number;
  saldo_atual: number;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface Lote {
  id: string;
  produto_id: string;
  numero_lote: string;
  data_fabricacao?: string | null;
  data_validade?: string | null;
  saldo_lote: number;
  ativo: boolean;
  criado_em: string;
}

export interface Movimentacao {
  id: string;
  produto_id: string;
  lote_id?: string | null;
  tipo: TipoMovimentacao;
  quantidade: number;
  saldo_anterior: number;
  saldo_posterior: number;
  documento_ref?: string | null;
  motivo_destino?: string | null;
  justificativa?: string | null;
  observacao?: string | null;
  usuario_id: string;
  criado_em: string;
  // Campos enriquecidos para exibição em listas
  produto_nome?: string;
  produto_codigo?: string;
  produto_unidade?: string;
  lote_numero?: string;
  usuario_nome?: string;
}

export interface ConferenciaFisica {
  id: string;
  produto_id: string;
  lote_id?: string | null;
  quantidade_anterior: number;
  quantidade_encontrada: number;
  diferenca: number;
  justificativa?: string | null;
  observacao?: string | null;
  realizado_por: string;
  criado_em: string;
  // Campos enriquecidos
  produto_nome?: string;
  produto_codigo?: string;
  lote_numero?: string;
  realizado_por_nome?: string;
}

// ==============================================================================
// DTOS DE CADASTRO E ATUALIZAÇÃO (NÃO PERMITEM SALDO_ATUAL)
// ==============================================================================

export interface CriarProdutoDTO {
  codigo: string;
  nome: string;
  descricao?: string | null;
  categoria: CategoriaProduto;
  unidade_medida: UnidadeMedida;
  fabricante?: string | null;
  localizacao?: string | null;
  controla_lote?: boolean;
  estoque_minimo?: number;
  estoque_maximo?: number;
}

export interface AtualizarProdutoDTO {
  codigo?: string;
  nome?: string;
  descricao?: string | null;
  categoria?: CategoriaProduto;
  unidade_medida?: UnidadeMedida;
  fabricante?: string | null;
  localizacao?: string | null;
  controla_lote?: boolean;
  estoque_minimo?: number;
  estoque_maximo?: number;
  ativo?: boolean;
  // saldo_atual é estritamente proibido aqui
}

// ==============================================================================
// DTOS DE MOVIMENTAÇÃO E CONFERÊNCIA
// ==============================================================================

export interface RegistrarEntradaDTO {
  produto_id: string;
  quantidade: number;
  documento_ref?: string | null;
  motivo_destino?: string | null;
  observacao?: string | null;
  numero_lote?: string | null;
  data_validade?: string | null;
}

export interface RegistrarSaidaDTO {
  produto_id: string;
  quantidade: number;
  documento_ref?: string | null;
  motivo_destino?: string | null;
  observacao?: string | null;
  lote_id?: string | null;
}

export interface RegistrarConferenciaDTO {
  produto_id: string;
  quantidade_encontrada: number;
  justificativa?: string | null;
  observacao?: string | null;
  lote_id?: string | null;
}

// ==============================================================================
// RESULTADOS E FILTROS DE CONSULTA
// ==============================================================================

export interface ResultadoOperacaoEstoque {
  sucesso: boolean;
  mensagem?: string;
  movimentacao_id?: string;
  conferencia_id?: string;
  saldo_anterior?: number;
  saldo_posterior?: number;
  diferenca?: number;
  lote_id?: string | null;
}

export interface ConsultaEstoqueProduto {
  produto: Produto;
  situacao: SituacaoEstoque;
  total_lotes: number;
  lotes_ativos: Lote[];
}

export interface FiltroProdutosDTO {
  termo?: string;
  categoria?: CategoriaProduto;
  apenas_ativos?: boolean;
  apenas_criticos?: boolean;
}

export interface FiltroMovimentacoesDTO {
  produto_id?: string;
  lote_id?: string;
  tipo?: TipoMovimentacao;
  usuario_id?: string;
  data_inicio?: string;
  data_fim?: string;
  limite?: number;
}

export interface FiltroConferenciasDTO {
  produto_id?: string;
  lote_id?: string;
  realizado_por?: string;
  data_inicio?: string;
  data_fim?: string;
  limite?: number;
}
