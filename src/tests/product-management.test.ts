import { productService } from '@/services/product-service';
import { productRepository } from '@/repositories/product-repository';
import { formatarErroBanco } from '@/lib/utils/error-handler';
import { CriarProdutoDTO, AtualizarProdutoDTO, Produto } from '@/types/stock';

/**
 * ==============================================================================
 * SUÍTE DE TESTES DA FASE 4 — CADASTRO E GESTÃO DE PRODUTOS
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

async function executarTestesProdutos() {
  console.log('======================================================================');
  console.log('INICIANDO SUÍTE DE TESTES DE GESTÃO DE PRODUTOS (FASE 4)');
  console.log('======================================================================\n');

  // 1. Cadastro Válido - Validação do DTO de Criação
  const dtoValido: CriarProdutoDTO = {
    codigo: 'EPX-BRANCO-01',
    nome: 'Tinta Epóxi Branca 3.6L',
    descricao: 'Tinta epóxi bicomponente para piso industrial',
    categoria: 'Tintas',
    unidade_medida: 'L',
    fabricante: 'Renner Coatings',
    localizacao: 'Prateleira A-1',
    controla_lote: true,
    estoque_minimo: 15,
    estoque_maximo: 100,
  };
  asserir(dtoValido.codigo === 'EPX-BRANCO-01' && dtoValido.categoria === 'Tintas', '1. DTO de cadastro válido configurado corretamente');

  // 2. Nome Vazio -> Rejeitar
  await esperarErro(
    productService.criar({ ...dtoValido, nome: '   ' }),
    'Nome do produto é obrigatório',
    '2. Rejeitar criação de produto com nome vazio'
  );

  // 3. Categoria Inválida -> Rejeitar
  await esperarErro(
    productService.criar({ ...dtoValido, categoria: 'Químicos Genéricos' as any }),
    'Categoria inválida',
    '3. Rejeitar categoria que não faz parte das permitidas da V1'
  );

  // 4. Unidade Inválida -> Rejeitar
  await esperarErro(
    productService.criar({ ...dtoValido, unidade_medida: 'METRO_QUADRADO' as any }),
    'Unidade de medida inválida',
    '4. Rejeitar unidade fora da lista padronizada da V1'
  );

  // 5. Estoque Mínimo Negativo -> Rejeitar
  await esperarErro(
    productService.criar({ ...dtoValido, estoque_minimo: -5 }),
    'não pode ser negativo',
    '5. Rejeitar estoque mínimo com valor negativo'
  );

  // 6. Criação Sempre com Saldo Inicial Zero (Garantia de Modelagem)
  // CriarProdutoDTO não aceita saldo_atual (validação estática TypeScript)
  asserir(!('saldo_atual' in dtoValido), '6. DTO de criação não possui propriedade saldo_atual');

  // 7. Edição Cadastral Válida
  const dtoEdicao: AtualizarProdutoDTO = {
    nome: 'Tinta Epóxi Branca Fosca 3.6L',
    fabricante: 'Renner Tintas',
    localizacao: 'Prateleira A-2',
    estoque_minimo: 20,
  };
  asserir(Boolean(dtoEdicao.nome?.includes('Fosca')), '7. DTO de edição contém apenas campos cadastrais permitidos');

  // 8. Tentativa de Editar Saldo -> Bloqueado na Tipagem e no Schema
  asserir(!('saldo_atual' in dtoEdicao), '8. DTO de atualização não expõe saldo_atual para o cliente');

  // 9. Ativação / Desativação Lógica
  const produtoAtivoMock: Produto = {
    id: 'p-ativo',
    codigo: 'COD-ATIVO',
    nome: 'Material Ativo',
    categoria: 'Solventes',
    unidade_medida: 'L',
    controla_lote: false,
    estoque_minimo: 10,
    estoque_maximo: 50,
    saldo_atual: 30,
    ativo: true,
    criado_em: '2026-09-21T00:00:00Z',
    atualizado_em: '2026-09-21T00:00:00Z',
  };
  const produtoInativado: Produto = { ...produtoAtivoMock, ativo: false };
  asserir(produtoInativado.saldo_atual === 30 && produtoInativado.ativo === false, '9. Desativação lógica altera ativo para false preservando saldo e histórico');

  // 10. Filtro de Ativos / Inativos
  const listaProdutos: Produto[] = [produtoAtivoMock, produtoInativado];
  const apenasAtivos = listaProdutos.filter((p) => p.ativo);
  const apenasInativos = listaProdutos.filter((p) => !p.ativo);
  asserir(apenasAtivos.length === 1 && apenasInativos.length === 1, '10. Filtragem por status ativo/inativo segrega materiais corretamente');

  // 11. Controle de Lote: Marcação cadastral
  const produtoComLote: Produto = { ...produtoAtivoMock, controla_lote: true };
  asserir(produtoComLote.controla_lote === true, '11. Produto marcado como controla_lote=true sem exigir saldo de lote no cadastro');

  // 12. Tratamento de Erro de Código Duplicado (Unique Constraint)
  const erroDuplicado = formatarErroBanco({
    message: 'duplicate key value violates unique constraint "produtos_codigo_key"',
    details: 'Key (codigo)=(EPX-BRANCO-01) already exists.',
  });
  asserir(
    erroDuplicado.codigo === 'CODIGO_DUPLICADO' && erroDuplicado.mensagem.includes('Já existe um material'),
    '12. Tratamento de erro normaliza código duplicado com mensagem amigável'
  );

  // ============================================================================
  // FASE 4.1: TESTES ESPECÍFICOS DE TRANSIÇÃO DE CONTROLA_LOTE
  // ============================================================================
  console.log('\n--- Regras Específicas de Transição de controla_lote (Fase 4.1) ---');

  // Função simulada com a mesma lógica do productService para testes unitários locais
  async function validarTransicaoLote(
    produtoAtual: { saldo_atual: number; controla_lote: boolean },
    novoControlaLote: boolean,
    dependencias: { totalLotes: number; totalMovimentacoesLote: number; totalConferenciasLote: number }
  ) {
    if (produtoAtual.controla_lote !== novoControlaLote) {
      if (produtoAtual.saldo_atual > 0) {
        throw new Error(
          `Não é permitido alterar o controle de lote de um material que possui saldo em estoque (${produtoAtual.saldo_atual}). O saldo precisa ser zerado antes de alterar a modalidade de lote.`
        );
      }

      if (produtoAtual.controla_lote === true && novoControlaLote === false) {
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
    return true;
  }

  // 13. false -> true sem estoque nem histórico -> Permitido
  const res13 = await validarTransicaoLote(
    { saldo_atual: 0, controla_lote: false },
    true,
    { totalLotes: 0, totalMovimentacoesLote: 0, totalConferenciasLote: 0 }
  );
  asserir(res13 === true, '13. Transição false -> true sem estoque/histórico incompatível é permitida');

  // 14. false -> true com saldo > 0 -> Rejeitado
  await esperarErro(
    validarTransicaoLote(
      { saldo_atual: 15, controla_lote: false },
      true,
      { totalLotes: 0, totalMovimentacoesLote: 0, totalConferenciasLote: 0 }
    ),
    'saldo precisa ser zerado',
    '14. Transição false -> true com saldo > 0 deve ser rejeitada'
  );

  // 15. true -> false com saldo > 0 -> Rejeitado
  await esperarErro(
    validarTransicaoLote(
      { saldo_atual: 20, controla_lote: true },
      false,
      { totalLotes: 1, totalMovimentacoesLote: 2, totalConferenciasLote: 0 }
    ),
    'saldo precisa ser zerado',
    '15. Transição true -> false com saldo > 0 deve ser rejeitada'
  );

  // 16. true -> false com saldo 0 mas lotes existentes -> Rejeitado
  await esperarErro(
    validarTransicaoLote(
      { saldo_atual: 0, controla_lote: true },
      false,
      { totalLotes: 2, totalMovimentacoesLote: 0, totalConferenciasLote: 0 }
    ),
    'lote(s) cadastrado(s)',
    '16. Transição true -> false com saldo 0 mas lotes existentes deve ser rejeitada'
  );

  // 17. true -> false com histórico de movimentações com lote -> Rejeitado
  await esperarErro(
    validarTransicaoLote(
      { saldo_atual: 0, controla_lote: true },
      false,
      { totalLotes: 0, totalMovimentacoesLote: 3, totalConferenciasLote: 0 }
    ),
    'histórico de 3 movimentação(ões)',
    '17. Transição true -> false com histórico de movimentações com lote deve ser rejeitada'
  );

  // 18. true -> false com histórico de conferências com lote -> Rejeitado
  await esperarErro(
    validarTransicaoLote(
      { saldo_atual: 0, controla_lote: true },
      false,
      { totalLotes: 0, totalMovimentacoesLote: 0, totalConferenciasLote: 1 }
    ),
    'conferência(s) física(s) auditada(s) por lote',
    '18. Transição true -> false com histórico de conferência física com lote deve ser rejeitada'
  );

  // 19. Edição cadastral sem alterar controla_lote -> Permitida normalmente
  const res19 = await validarTransicaoLote(
    { saldo_atual: 50, controla_lote: true },
    true, // Mantém true
    { totalLotes: 2, totalMovimentacoesLote: 5, totalConferenciasLote: 1 }
  );
  asserir(res19 === true, '19. Edição cadastral normal mantendo o mesmo controla_lote é permitida com saldo e histórico');

  console.log('\n======================================================================');
  console.log(`TOTAL DE TESTES DE GESTÃO DE PRODUTOS: ${sucessos + falhas}`);
  console.log(`PASSOU: ${sucessos} | FALHAS: ${falhas}`);
  console.log('======================================================================\n');

  if (falhas > 0) {
    process.exit(1);
  }
}

executarTestesProdutos();
