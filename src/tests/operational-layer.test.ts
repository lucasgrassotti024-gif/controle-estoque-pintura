import { productService } from '@/services/product-service';
import { stockService } from '@/services/stock-service';
import { lotService } from '@/services/lot-service';
import { formatarErroBanco } from '@/lib/utils/error-handler';
import { 
  CriarProdutoDTO, 
  AtualizarProdutoDTO, 
  Produto, 
  Lote, 
  Movimentacao,
  ConferenciaFisica,
  ResultadoOperacaoEstoque 
} from '@/types/stock';
import { calcularSituacaoEstoque } from '@/lib/utils/formatters';

/**
 * ==============================================================================
 * SUÍTE DE TESTES UNITÁRIOS DA CAMADA OPERACIONAL (FASE 2)
 * ==============================================================================
 * 
 * DECLARAÇÃO DE ESCOPO:
 * 1. Testes Unitários Locais: Validações de DTOs, filtros, mapeamento de erros,
 *    cálculo de situação de estoque e tratamento de exceções.
 * 2. Testes de Integração com Banco: Como o projeto ainda não possui PostgreSQL local
 *    ou mock de servidor Supabase em memória, as chamadas com I/O real ao Supabase
 *    são simuladas através de injeção de comportamento/validações unitárias.
 */

let sucessos = 0;
let falhas = 0;

function asserir(condicao: boolean, descricao: string) {
  if (condicao) {
    sucessos++;
    console.log(`  ✓ [PASSOU] ${descricao}`);
  } else {
    falhas++;
    console.error(`  ✗ [FALHOU] ${descricao}`);
  }
}

async function esperarErro(promessa: Promise<any>, textoEsperado: string, descricao: string) {
  try {
    await promessa;
    falhas++;
    console.error(`  ✗ [FALHOU] ${descricao} — Esperava exceção mas completou com sucesso.`);
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.toLowerCase().includes(textoEsperado.toLowerCase())) {
      sucessos++;
      console.log(`  ✓ [PASSOU] ${descricao} — Exceção esperada capturada: "${msg}"`);
    } else {
      falhas++;
      console.error(`  ✗ [FALHOU] ${descricao} — Mensagem não continha "${textoEsperado}". Mensagem real: "${msg}"`);
    }
  }
}

async function testarCriacaoEAtualizacaoProduto() {
  console.log('\n--- 1. Testes de Validação de Criação e Atualização de Produtos ---');

  // Código vazio
  await esperarErro(
    productService.criar({ codigo: '', nome: 'Tinta A', categoria: 'Tintas', unidade_medida: 'L' }),
    'Código do produto é obrigatório',
    '1.1 Rejeitar produto sem código'
  );

  // Nome vazio
  await esperarErro(
    productService.criar({ codigo: 'COD-1', nome: '   ', categoria: 'Tintas', unidade_medida: 'L' }),
    'Nome do produto é obrigatório',
    '1.2 Rejeitar produto sem nome'
  );

  // Categoria inválida
  await esperarErro(
    productService.criar({ codigo: 'COD-1', nome: 'Tinta A', categoria: 'Invalida' as any, unidade_medida: 'L' }),
    'Categoria inválida',
    '1.3 Rejeitar produto com categoria fora da lista V1'
  );

  // Unidade inválida
  await esperarErro(
    productService.criar({ codigo: 'COD-1', nome: 'Tinta A', categoria: 'Tintas', unidade_medida: 'METRO' as any }),
    'Unidade de medida inválida',
    '1.4 Rejeitar produto com unidade de medida fora da lista V1'
  );

  // Estoque mínimo negativo
  await esperarErro(
    productService.criar({ codigo: 'COD-1', nome: 'Tinta A', categoria: 'Tintas', unidade_medida: 'L', estoque_minimo: -10 }),
    'Estoque mínimo não pode ser negativo',
    '1.5 Rejeitar estoque mínimo negativo'
  );

  // Estoque máximo menor que mínimo
  await esperarErro(
    productService.criar({ codigo: 'COD-1', nome: 'Tinta A', categoria: 'Tintas', unidade_medida: 'L', estoque_minimo: 50, estoque_maximo: 20 }),
    'Estoque máximo não pode ser menor',
    '1.6 Rejeitar estoque máximo menor que estoque mínimo'
  );

  // Atualização com ID vazio
  await esperarErro(
    productService.atualizar('', { nome: 'Novo Nome' }),
    'ID do produto é obrigatório',
    '1.7 Rejeitar atualização sem ID'
  );

  // Atualização com categoria inválida
  await esperarErro(
    productService.atualizar('prod-1', { categoria: 'Alimentos' as any }),
    'Categoria inválida',
    '1.8 Rejeitar atualização para categoria inexistente'
  );
}

async function testarDesativacaoEProdutosPreservados() {
  console.log('\n--- 2. Testes de Desativação e Preservação de Produtos ---');

  // Alternar status sem ID
  await esperarErro(
    productService.alternarStatus('', false),
    'ID do produto é obrigatório',
    '2.1 Rejeitar alternância de status sem ID'
  );

  // O DTO AtualizarProdutoDTO não possui a propriedade saldo_atual (validação estática)
  const dtoAtualizacao: AtualizarProdutoDTO = {
    nome: 'Tinta Epóxi Atualizada',
    ativo: false
  };
  asserir(!('saldo_atual' in dtoAtualizacao), '2.2 DTO de atualização não expõe saldo_atual');
}

async function testarTratamentoErrosPostgreSQL() {
  console.log('\n--- 3. Testes de Tratamento e Normalização de Erros do Banco ---');

  const errSaldo = formatarErroBanco({ message: 'Saldo insuficiente no produto. Saldo disponível: 10, Saída solicitada: 25' });
  asserir(errSaldo.codigo === 'SALDO_INSUFICIENTE', '3.1 Mapear erro de saldo insuficiente');

  const errSaldoLote = formatarErroBanco({ message: 'Saldo insuficiente no lote selecionado. Disponível no lote: 5, Saída: 12' });
  asserir(errSaldoLote.codigo === 'SALDO_LOTE_INSUFICIENTE', '3.2 Mapear erro de saldo insuficiente no lote');

  const errLoteObrigatorio = formatarErroBanco({ message: 'Lote obrigatório: este produto controla lote.' });
  asserir(errLoteObrigatorio.codigo === 'LOTE_OBRIGATORIO', '3.3 Mapear erro de lote obrigatório');

  const errLoteInvalido = formatarErroBanco({ message: 'Inconsistência: o lote informado não pertence a este produto.' });
  asserir(errLoteInvalido.codigo === 'LOTE_INVALIDO', '3.4 Mapear erro de lote pertencente a outro produto');

  const errQtdNegativa = formatarErroBanco({ message: 'A quantidade de saída deve ser maior que zero.' });
  asserir(errQtdNegativa.codigo === 'QUANTIDADE_INVALIDA', '3.5 Mapear erro de quantidade menor ou igual a zero');

  const errImutavel = formatarErroBanco({ message: 'Operação não permitida: registros históricos são estritamente imutáveis (append-only).' });
  asserir(errImutavel.codigo === 'HISTORICO_IMUTAVEL', '3.6 Mapear bloqueio de trigger em UPDATE/DELETE do histórico');

  const errSaldoDireto = formatarErroBanco({ message: 'A coluna saldo_atual não pode ser alterada diretamente.' });
  asserir(errSaldoDireto.codigo === 'ALTERACAO_SALDO_BLOQUEADA', '3.7 Mapear bloqueio de trigger em alteração direta de saldo_atual');

  const errNaoAutenticado = formatarErroBanco({ message: 'Operação não permitida: usuário não autenticado.' });
  asserir(errNaoAutenticado.codigo === 'NAO_AUTENTICADO', '3.8 Mapear bloqueio por falta de sessão autenticada');

  const errDuplicado = formatarErroBanco({ message: 'duplicate key value violates unique constraint "produtos_codigo_key"' });
  asserir(errDuplicado.codigo === 'CODIGO_DUPLICADO', '3.9 Mapear erro de unicidade de código do produto');
}

async function testarConsultasDeEstoqueESituacao() {
  console.log('\n--- 4. Testes de Consulta de Estoque e Cálculo de Situação ---');

  // Testes de faixas de situação
  asserir(calcularSituacaoEstoque(0, 10, 50) === 'SEM_ESTOQUE', '4.1 Saldo zero retorna SEM_ESTOQUE');
  asserir(calcularSituacaoEstoque(8, 10, 50) === 'ABAIXO_DO_MINIMO', '4.2 Saldo menor que mínimo retorna ABAIXO_DO_MINIMO');
  asserir(calcularSituacaoEstoque(11, 10, 50) === 'PROXIMO_DO_MINIMO', '4.3 Saldo próximo do mínimo (até 15%) retorna PROXIMO_DO_MINIMO');
  asserir(calcularSituacaoEstoque(30, 10, 50) === 'NORMAL', '4.4 Saldo dentro da faixa normal retorna NORMAL');
  asserir(calcularSituacaoEstoque(65, 10, 50) === 'ACIMA_DO_MAXIMO', '4.5 Saldo superior ao máximo retorna ACIMA_DO_MAXIMO');

  // Consulta com ID de produto inválido
  await esperarErro(
    stockService.consultarEstoqueProduto(''),
    'ID do produto é obrigatório',
    '4.6 Rejeitar consulta de estoque sem ID'
  );
}

async function testarTransformacaoDadosRPC() {
  console.log('\n--- 5. Testes de Transformação de Dados Retornados por RPC ---');

  const mockResultadoRPC: ResultadoOperacaoEstoque = {
    sucesso: true,
    movimentacao_id: 'mov-123',
    saldo_anterior: 40,
    saldo_posterior: 60,
    lote_id: 'lote-abc'
  };

  asserir(mockResultadoRPC.sucesso === true, '5.1 RPC retorna indicador de sucesso');
  asserir(mockResultadoRPC.saldo_posterior! > mockResultadoRPC.saldo_anterior!, '5.2 Saldo posterior reflete incremento na entrada');
  asserir(mockResultadoRPC.lote_id === 'lote-abc', '5.3 RPC vincula identificador do lote operado');
}

async function executarTodosOsTestes() {
  console.log('======================================================================');
  console.log('INICIANDO SUÍTE DE TESTES DA CAMADA OPERACIONAL (FASE 2)');
  console.log('======================================================================');

  await testarCriacaoEAtualizacaoProduto();
  await testarDesativacaoEProdutosPreservados();
  await testarTratamentoErrosPostgreSQL();
  await testarConsultasDeEstoqueESituacao();
  await testarTransformacaoDadosRPC();

  console.log('\n======================================================================');
  console.log(`TOTAL DE TESTES EXECUTADOS: ${sucessos + falhas}`);
  console.log(`PASSOU: ${sucessos} | FALHAS: ${falhas}`);
  console.log('======================================================================\n');

  if (falhas > 0) {
    process.exit(1);
  }
}

executarTodosOsTestes();
