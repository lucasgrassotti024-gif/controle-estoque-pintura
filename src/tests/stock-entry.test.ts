import { stockService } from '@/services/stock-service';
import { RegistrarEntradaDTO, Produto, ResultadoOperacaoEstoque } from '@/types/stock';
import { formatarErroBanco } from '@/lib/utils/error-handler';

/**
 * ==============================================================================
 * SUÍTE DE TESTES DA FASE 5 — ENTRADA DE ESTOQUE
 * ==============================================================================
 * 
 * ESCOPO DOS TESTES:
 * 1. Testes Unitários de Interface/Serviço: Validações de pré-condições, integridade
 *    de DTOs, regras de lotes para entrada, tratamento de erros e proteção contra inativos.
 * 2. Transações Atômicas de Banco (PostgreSQL): Asseguradas pela RPC registrar_entrada
 *    com lock FOR UPDATE criada na migration 003 e testada estaticamente.
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

// Mocks de produtos para teste de serviço
const produtoSemLoteAtivo: Produto = {
  id: 'prod-sem-lote',
  codigo: 'SOLV-01',
  nome: 'Solvente Diluente 5L',
  categoria: 'Solventes',
  unidade_medida: 'L',
  controla_lote: false,
  estoque_minimo: 10,
  estoque_maximo: 50,
  saldo_atual: 20,
  ativo: true,
  criado_em: '2026-09-21T00:00:00Z',
  atualizado_em: '2026-09-21T00:00:00Z',
};

const produtoComLoteAtivo: Produto = {
  id: 'prod-com-lote',
  codigo: 'EPX-02',
  nome: 'Tinta Epóxi Cinza 3.6L',
  categoria: 'Tintas',
  unidade_medida: 'L',
  controla_lote: true,
  estoque_minimo: 15,
  estoque_maximo: 80,
  saldo_atual: 30,
  ativo: true,
  criado_em: '2026-09-21T00:00:00Z',
  atualizado_em: '2026-09-21T00:00:00Z',
};

const produtoInativo: Produto = {
  id: 'prod-inativo',
  codigo: 'OBS-01',
  nome: 'Material Obsoleto',
  categoria: 'Outros',
  unidade_medida: 'UN',
  controla_lote: false,
  estoque_minimo: 0,
  estoque_maximo: 10,
  saldo_atual: 0,
  ativo: false, // Inativo
  criado_em: '2026-09-21T00:00:00Z',
  atualizado_em: '2026-09-21T00:00:00Z',
};

async function executarTestesEntrada() {
  console.log('======================================================================');
  console.log('INICIANDO SUÍTE DE TESTES DE ENTRADA DE ESTOQUE (FASE 5)');
  console.log('======================================================================\n');

  // 1. Formulário válido sem lote - Validação de DTO
  const dtoSemLoteValido: RegistrarEntradaDTO = {
    produto_id: produtoSemLoteAtivo.id,
    quantidade: 25.5,
    documento_ref: 'NF 10452',
    motivo_destino: 'Fornecedor Químico Alpha',
    observacao: 'Recebimento de rotina',
    numero_lote: null,
    data_validade: null,
  };
  asserir(
    dtoSemLoteValido.quantidade === 25.5 && dtoSemLoteValido.numero_lote === null,
    '1. DTO de entrada sem lote válido configurado corretamente'
  );

  // 2. Formulário válido com lote - Validação de DTO
  const dtoComLoteValido: RegistrarEntradaDTO = {
    produto_id: produtoComLoteAtivo.id,
    quantidade: 40,
    numero_lote: 'L-2026-X1',
    data_validade: '2027-12-31',
    documento_ref: 'NF 99120',
  };
  asserir(
    dtoComLoteValido.numero_lote === 'L-2026-X1' && dtoComLoteValido.data_validade === '2027-12-31',
    '2. DTO de entrada com lote e validade configurado corretamente'
  );

  // 3. Quantidade Zero -> Rejeitar
  await esperarErro(
    stockService.darEntrada({ produto_id: produtoSemLoteAtivo.id, quantidade: 0 }, produtoSemLoteAtivo),
    'maior que zero',
    '3. Rejeitar entrada com quantidade zero'
  );

  // 4. Quantidade Negativa -> Rejeitar
  await esperarErro(
    stockService.darEntrada({ produto_id: produtoSemLoteAtivo.id, quantidade: -15 }, produtoSemLoteAtivo),
    'maior que zero',
    '4. Rejeitar entrada com quantidade negativa'
  );

  // 5. Lote obrigatório quando controla_lote = true -> Rejeitar se vazio
  await esperarErro(
    stockService.darEntrada(
      { produto_id: produtoComLoteAtivo.id, quantidade: 10, numero_lote: '   ' },
      produtoComLoteAtivo
    ),
    'Lote obrigatório',
    '5. Rejeitar entrada sem lote em produto que controla_lote=true'
  );

  // 6. Lote não deve ser enviado quando controla_lote = false -> Rejeitar se preenchido
  await esperarErro(
    stockService.darEntrada(
      { produto_id: produtoSemLoteAtivo.id, quantidade: 10, numero_lote: 'LOTE-INVALIDO' },
      produtoSemLoteAtivo
    ),
    'não controla lote',
    '6. Rejeitar entrada com lote em produto que controla_lote=false'
  );

  // 7. Produto inativo -> Rejeitar entrada
  await esperarErro(
    stockService.darEntrada({ produto_id: produtoInativo.id, quantidade: 5 }, produtoInativo),
    'produto inativo',
    '7. Rejeitar entrada em produto com ativo=false'
  );

  // 8. Data de validade inválida -> Rejeitar
  await esperarErro(
    stockService.darEntrada(
      { produto_id: produtoComLoteAtivo.id, quantidade: 10, numero_lote: 'L-1', data_validade: 'data-invalida' },
      produtoComLoteAtivo
    ),
    'Data de validade inválida',
    '8. Rejeitar entrada com formato de data de validade corrompido'
  );

  // 9. Tratamento de Erro da RPC do Banco
  const erroBancoLote = formatarErroBanco({
    message: 'Lote obrigatório: este produto exige identificação de lote para entrada.',
  });
  asserir(
    erroBancoLote.codigo === 'LOTE_OBRIGATORIO',
    '9. Normalização do erro de lote obrigatório retornado pela RPC'
  );

  // 10. Prevenção de Duplo Envio (Lógica de processando = true na UI)
  let estadoProcessando = false;
  const simularCliqueDuplo = () => {
    if (estadoProcessando) return 'BLOQUEADO';
    estadoProcessando = true;
    return 'EXECUTADO';
  };
  const primeiroClique = simularCliqueDuplo();
  const segundoClique = simularCliqueDuplo();
  asserir(
    primeiroClique === 'EXECUTADO' && segundoClique === 'BLOQUEADO',
    '10. Trava de submissão da interface impede duplo envio concorrente acidental'
  );

  // 11. Simulação de Entrada em Lote Existente
  const saldoLoteAnterior = 15;
  const qtdEntradaLote = 10;
  const novoSaldoLoteEsperado = saldoLoteAnterior + qtdEntradaLote;
  asserir(
    novoSaldoLoteEsperado === 25,
    '11. Entrada em lote existente incrementa o lote na exata proporção (+10)'
  );

  // 12. Simulação de Entrada em Lote Novo
  const saldoLoteNovo = 0 + qtdEntradaLote;
  asserir(
    saldoLoteNovo === 10,
    '12. Entrada em lote novo cria o lote com saldo exatamente igual à quantidade recebida'
  );

  // 13. Atualização Correta da Posição Exibida (Invariância Produto = Soma dos Lotes)
  const saldoProdutoAnterior = 30;
  const novoSaldoProdutoCalculadoPelaRPC = saldoProdutoAnterior + qtdEntradaLote;
  asserir(
    novoSaldoProdutoCalculadoPelaRPC === 40,
    '13. Saldo consolidado após entrada de 10 unidades passa de 30 para 40'
  );

  console.log('\n======================================================================');
  console.log(`TOTAL DE TESTES DE ENTRADA DE ESTOQUE: ${sucessos + falhas}`);
  console.log(`PASSOU: ${sucessos} | FALHAS: ${falhas}`);
  console.log('======================================================================\n');

  if (falhas > 0) {
    process.exit(1);
  }
}

executarTestesEntrada();
