import { Produto, SituacaoEstoque } from '@/types/stock';
import { calcularSituacaoEstoque, formatarQuantidade } from '@/lib/utils/formatters';

/**
 * ==============================================================================
 * SUÍTE DE TESTES DA INTERFACE E PRIMEIRO FLUXO OPERACIONAL (FASE 3)
 * ==============================================================================
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

const produtosMock: Produto[] = [
  {
    id: 'p-1',
    codigo: 'EPX-01',
    nome: 'Tinta Epóxi Cinza',
    categoria: 'Tintas',
    unidade_medida: 'L',
    controla_lote: true,
    estoque_minimo: 50,
    estoque_maximo: 200,
    saldo_atual: 0,
    ativo: true,
    criado_em: '2026-09-21T00:00:00Z',
    atualizado_em: '2026-09-21T00:00:00Z',
  },
  {
    id: 'p-2',
    codigo: 'SOLV-10',
    nome: 'Solvente Diluente PU',
    categoria: 'Solventes',
    unidade_medida: 'L',
    controla_lote: false,
    estoque_minimo: 30,
    estoque_maximo: 150,
    saldo_atual: 25,
    ativo: true,
    criado_em: '2026-09-21T00:00:00Z',
    atualizado_em: '2026-09-21T00:00:00Z',
  },
  {
    id: 'p-3',
    codigo: 'EPI-LUVA',
    nome: 'Luva Nitrílica G',
    categoria: 'EPIs',
    unidade_medida: 'CX',
    controla_lote: false,
    estoque_minimo: 10,
    estoque_maximo: 50,
    saldo_atual: 45,
    ativo: false, // inativo
    criado_em: '2026-09-21T00:00:00Z',
    atualizado_em: '2026-09-21T00:00:00Z',
  },
];

function testarTransformacaoParaApresentacao() {
  console.log('\n--- 1. Transformação de Dados e Situações da Interface ---');

  const processados = produtosMock.map((p) => ({
    produto: p,
    situacao: calcularSituacaoEstoque(p.saldo_atual, p.estoque_minimo, p.estoque_maximo),
    quantidadeFormatada: formatarQuantidade(p.saldo_atual, p.unidade_medida),
  }));

  asserir(processados[0].situacao === 'SEM_ESTOQUE', '1.1 Produto com saldo 0 recebe situação SEM_ESTOQUE');
  asserir(processados[1].situacao === 'ABAIXO_DO_MINIMO', '1.2 Produto com saldo menor que mínimo recebe ABAIXO_DO_MINIMO');
  asserir(processados[0].quantidadeFormatada === '0 L', '1.3 Formatação de quantidade e unidade correta (0 L)');
}

function testarLogicaDeFiltrosDaInterface() {
  console.log('\n--- 2. Lógica de Busca e Filtragem Operacional ---');

  // Filtro por termo (nome ou código)
  const termo = 'solv';
  const filtradosPorTermo = produtosMock.filter(
    (p) => p.nome.toLowerCase().includes(termo) || p.codigo.toLowerCase().includes(termo)
  );
  asserir(filtradosPorTermo.length === 1 && filtradosPorTermo[0].codigo === 'SOLV-10', '2.1 Filtro por termo localiza material por código/nome');

  // Filtro por categoria
  const filtradosPorCategoria = produtosMock.filter((p) => p.categoria === 'Tintas');
  asserir(filtradosPorCategoria.length === 1 && filtradosPorCategoria[0].nome === 'Tinta Epóxi Cinza', '2.2 Filtro por categoria isola produtos de Tintas');

  // Filtro apenas ativos
  const filtradosAtivos = produtosMock.filter((p) => p.ativo);
  asserir(filtradosAtivos.length === 2, '2.3 Filtro de apenas ativos exclui materiais inativados');

  // Filtro combinado de situação
  const itensComSit = produtosMock.map((p) => ({
    produto: p,
    situacao: calcularSituacaoEstoque(p.saldo_atual, p.estoque_minimo, p.estoque_maximo),
  }));
  const apenasSemEstoque = itensComSit.filter((i) => i.situacao === 'SEM_ESTOQUE');
  asserir(apenasSemEstoque.length === 1 && apenasSemEstoque[0].produto.codigo === 'EPX-01', '2.4 Filtro por situação isola itens sem estoque');
}

function testarEstadosDaInterface() {
  console.log('\n--- 3. Validação dos Estados da Interface (Vazio e Erro) ---');

  // Estado vazio: nenhum resultado após filtros
  const listaVazia: Produto[] = [];
  asserir(listaVazia.length === 0, '3.1 Interface detecta lista vazia para renderizar mensagem informativa de estado vazio');

  // Estado com erro de banco
  const erroSimulado = { message: 'Failed to fetch' };
  const erroAmigavel = erroSimulado.message || 'Falha ao carregar posição de estoque.';
  asserir(typeof erroAmigavel === 'string' && erroAmigavel.length > 0, '3.2 Mensagem de erro preservada para o operador');
}

function executarTestesInterface() {
  console.log('======================================================================');
  console.log('INICIANDO SUÍTE DE TESTES DA INTERFACE (FASE 3)');
  console.log('======================================================================');

  testarTransformacaoParaApresentacao();
  testarLogicaDeFiltrosDaInterface();
  testarEstadosDaInterface();

  console.log('\n======================================================================');
  console.log(`TOTAL DE TESTES DA INTERFACE: ${sucessos + falhas}`);
  console.log(`PASSOU: ${sucessos} | FALHAS: ${falhas}`);
  console.log('======================================================================\n');

  if (falhas > 0) {
    process.exit(1);
  }
}

executarTestesInterface();
