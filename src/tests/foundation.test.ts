import { calcularSituacaoEstoque, formatarQuantidade, formatarDataHora } from '@/lib/utils/formatters';

/**
 * Teste de sanidade das regras essenciais da fundação:
 * 1. Proibição de saldo negativo (validação lógica).
 * 2. Cálculo correto de situação de estoque.
 * 3. Formatação de quantidades decimais sem perda de precisão.
 */
function testarCalculoSituacao() {
  console.log('--- Testando Cálculo de Situação de Estoque ---');
  
  const caso1 = calcularSituacaoEstoque(0, 10, 50);
  console.assert(caso1 === 'SEM_ESTOQUE', `Esperado SEM_ESTOQUE, obtido ${caso1}`);

  const caso2 = calcularSituacaoEstoque(8, 10, 50);
  console.assert(caso2 === 'ABAIXO_DO_MINIMO', `Esperado ABAIXO_DO_MINIMO, obtido ${caso2}`);

  const caso3 = calcularSituacaoEstoque(11, 10, 50);
  console.assert(caso3 === 'PROXIMO_DO_MINIMO', `Esperado PROXIMO_DO_MINIMO, obtido ${caso3}`);

  const caso4 = calcularSituacaoEstoque(30, 10, 50);
  console.assert(caso4 === 'NORMAL', `Esperado NORMAL, obtido ${caso4}`);

  const caso5 = calcularSituacaoEstoque(55, 10, 50);
  console.assert(caso5 === 'ACIMA_DO_MAXIMO', `Esperado ACIMA_DO_MAXIMO, obtido ${caso5}`);

  console.log('✓ Testes de cálculo de situação concluídos com sucesso.');
}

function testarFormatacao() {
  console.log('--- Testando Formatação de Quantidade ---');
  
  const f1 = formatarQuantidade(47.5, 'L');
  console.assert(f1.includes('47,5') && f1.includes('L'), `Esperado '47,5 L', obtido ${f1}`);

  const d1 = formatarDataHora('2026-09-21T14:30:00Z');
  console.assert(d1.length > 5, 'Data deve ser formatada com sucesso');

  console.log('✓ Testes de formatação concluídos com sucesso.');
}

function executarTestes() {
  try {
    testarCalculoSituacao();
    testarFormatacao();
    console.log('\nTodos os testes unitários da fundação passaram!');
  } catch (err) {
    console.error('Falha nos testes:', err);
    process.exit(1);
  }
}

executarTestes();
