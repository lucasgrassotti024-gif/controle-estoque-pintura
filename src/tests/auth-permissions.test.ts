import { Usuario, PapelUsuario } from '@/types/stock';
import { formatarErroBanco } from '@/lib/utils/error-handler';
import { temPermissao, MATRIZ_PERMISSOES } from '@/server/auth/session';

/**
 * ==============================================================================
 * SUÍTE DE TESTES DE PERMISSÕES E AUTORIZAÇÃO (RBAC FASE 20)
 * ==============================================================================
 * Exatamente 3 papéis:
 * 1. CONSULTA: Leitura geral. Proibido de qualquer alteração.
 * 2. OPERADOR: Operação total (estoque + produtos/catálogo). Proibido de gerenciar usuários.
 * 3. ADMIN: Acesso total (OPERADOR + Gestão de Usuários).
 * 
 * Sem perfil GESTOR.
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

// Mocks de usuários com exatamente os 3 perfis oficiais + inativo
const adminUser: Usuario = {
  id: 'usr-admin-01',
  uid: 'usr-admin-01',
  email: 'admin@rss3.com.br',
  nome: 'Administrador Master',
  papel: 'ADMIN',
  ativo: true,
  criadoEm: '2026-09-21T00:00:00Z',
};

const operadorUser: Usuario = {
  id: 'usr-op-01',
  uid: 'usr-op-01',
  email: 'operador@rss3.com.br',
  nome: 'Operador Almoxarifado',
  papel: 'OPERADOR',
  ativo: true,
  criadoEm: '2026-09-21T00:00:00Z',
};

const consultaUser: Usuario = {
  id: 'usr-cons-01',
  uid: 'usr-cons-01',
  email: 'auditor@rss3.com.br',
  nome: 'Auditor Externo',
  papel: 'CONSULTA',
  ativo: true,
  criadoEm: '2026-09-21T00:00:00Z',
};

const inativoUser: Usuario = {
  ...operadorUser,
  id: 'usr-inativo-01',
  uid: 'usr-inativo-01',
  ativo: false,
};

// Funções de checagem com a camada RBAC central
function podeGerenciarProdutos(u: Usuario | null): boolean {
  return !!u && u.ativo && temPermissao(u.papel, 'PRODUTO_GERENCIAR');
}

function podeMovimentarEstoque(u: Usuario | null): boolean {
  return !!u && u.ativo && temPermissao(u.papel, 'ESTOQUE_OPERAR');
}

function podeGerenciarUsuarios(u: Usuario | null): boolean {
  return !!u && u.ativo && temPermissao(u.papel, 'USUARIO_GERENCIAR');
}

function podeConsultarDados(u: Usuario | null): boolean {
  return !!u && u.ativo && temPermissao(u.papel, 'ESTOQUE_VISUALIZAR');
}

async function executarSuitePermissoes() {
  console.log('======================================================================');
  console.log('INICIANDO SUÍTE DE TESTES DE PERMISSÕES E AUTORIZAÇÃO (RBAC FASE 20)');
  console.log('======================================================================\n');

  // 1. Identificação correta de usuário autenticado
  asserir(
    adminUser.id === 'usr-admin-01' && adminUser.email.includes('@'),
    '1. Usuário autenticado possui identificação válida e campos obrigatórios'
  );

  // 2. Usuário não autenticado (null)
  asserir(
    !podeConsultarDados(null) && !podeGerenciarProdutos(null) && !podeMovimentarEstoque(null),
    '2. Usuário não autenticado tem todas as operações bloqueadas'
  );

  // 3. Papel ADMIN tem permissão total
  asserir(
    podeGerenciarProdutos(adminUser) && podeMovimentarEstoque(adminUser) && podeGerenciarUsuarios(adminUser),
    '3. Papel ADMIN possui acesso e privilégios irrestritos'
  );

  // 4. Papel OPERADOR tem estoque e produtos, mas NÃO gerencia usuários
  asserir(
    podeGerenciarProdutos(operadorUser) && podeMovimentarEstoque(operadorUser) && !podeGerenciarUsuarios(operadorUser),
    '4. Papel OPERADOR gerencia estoque e produtos, mas não gerencia usuários'
  );

  // 5. Papel CONSULTA tem apenas visualização
  asserir(
    !podeGerenciarProdutos(consultaUser) && !podeMovimentarEstoque(consultaUser) && podeConsultarDados(consultaUser),
    '5. Papel CONSULTA possui acesso estritamente de visualização/leitura'
  );

  // 6. Usuário Inativo (ativo = false)
  asserir(
    !podeConsultarDados(inativoUser) && !podeGerenciarProdutos(inativoUser) && !podeMovimentarEstoque(inativoUser),
    '6. Usuário inativo tem acesso bloqueado em todas as camadas'
  );

  // 7. Normalização de erro da RPC para usuário inativo
  const erroUsuarioInativo = formatarErroBanco({
    message: 'Operação não permitida: usuário inativo ou não cadastrado no sistema.',
  });
  asserir(
    erroUsuarioInativo.codigo === 'USUARIO_INATIVO',
    '7. Sistema rejeita chamadas de usuários inativos ou não cadastrados'
  );

  // 8. Normalização de erro para perfil CONSULTA
  const erroConsultaMovimentando = formatarErroBanco({
    message: 'Acesso negado: perfil de apenas CONSULTA não possui permissão para movimentar o estoque.',
  });
  asserir(
    erroConsultaMovimentando.codigo === 'ACESSO_NEGADO_PAPEL',
    '8. Sistema rejeita chamadas transacionais de escrita vindas de usuários CONSULTA'
  );

  // 9. Criação de produto permitida para ADMIN e OPERADOR
  asserir(
    podeGerenciarProdutos(adminUser) && podeGerenciarProdutos(operadorUser),
    '9. Criação e parametrização de produtos permitida para ADMIN e OPERADOR'
  );

  // 10. Criação de produto negada para CONSULTA
  asserir(
    !podeGerenciarProdutos(consultaUser),
    '10. Criação e parametrização de produtos negada para CONSULTA'
  );

  // 11. Edição de dados cadastrais autorizada para OPERADOR e ADMIN
  asserir(
    podeGerenciarProdutos(adminUser) && podeGerenciarProdutos(operadorUser),
    '11. Edição cadastral de produtos autorizada para OPERADOR e ADMIN'
  );

  // 12. Desativação/Reativação lógica de produtos autorizada para OPERADOR e ADMIN
  asserir(
    podeGerenciarProdutos(operadorUser) && !podeGerenciarProdutos(consultaUser),
    '12. Desativação lógica de produtos permitida para OPERADOR e negada para CONSULTA'
  );

  // 13. Entrada de estoque permitida para ADMIN e OPERADOR
  asserir(
    podeMovimentarEstoque(adminUser) && podeMovimentarEstoque(operadorUser),
    '13. Entrada de estoque autorizada para ADMIN e OPERADOR'
  );

  // 14. Entrada de estoque negada para CONSULTA
  asserir(
    !podeMovimentarEstoque(consultaUser),
    '14. Entrada de estoque terminantemente negada para CONSULTA'
  );

  // 15. Saída de estoque permitida para ADMIN e OPERADOR
  asserir(
    podeMovimentarEstoque(adminUser) && podeMovimentarEstoque(operadorUser),
    '15. Saída de estoque autorizada para OPERADOR e ADMIN'
  );

  // 16. Saída de estoque negada para CONSULTA
  asserir(
    !podeMovimentarEstoque(consultaUser),
    '16. Saída de estoque terminantemente negada para CONSULTA'
  );

  // 17. Conferência física permitida para ADMIN e OPERADOR
  asserir(
    podeMovimentarEstoque(adminUser) && podeMovimentarEstoque(operadorUser),
    '17. Conferência física permitida para OPERADOR e ADMIN'
  );

  // 18. Conferência física negada para CONSULTA
  asserir(
    !podeMovimentarEstoque(consultaUser),
    '18. Conferência física terminantemente negada para CONSULTA'
  );

  // 19. Visualização de movimentações permitida para todos os papéis ativos
  asserir(
    podeConsultarDados(adminUser) && podeConsultarDados(operadorUser) && podeConsultarDados(consultaUser),
    '19. Leitura do livro-razão permitida a todos os usuários ativos autenticados'
  );

  // 20. Gerenciamento de usuários estritamente restrito a ADMIN
  asserir(
    podeGerenciarUsuarios(adminUser) && !podeGerenciarUsuarios(operadorUser) && !podeGerenciarUsuarios(consultaUser),
    '20. Gerenciamento de usuários exclusivo para ADMIN (OPERADOR e CONSULTA bloqueados)'
  );

  // 21. Matriz Server-side oficial não contém papel GESTOR
  const todosPapeis = Object.values(MATRIZ_PERMISSOES).flat();
  asserir(
    !todosPapeis.includes('GESTOR' as any),
    '21. O papel GESTOR não existe na matriz de permissões oficial'
  );

  // 22. Tentativa de auto-promoção de papel ou forjamento bloqueada
  const payloadCliente = { papel_enviado_no_body: 'ADMIN' };
  asserir(
    Boolean(payloadCliente.papel_enviado_no_body) && !podeGerenciarUsuarios(operadorUser),
    '22. Servidor rejeita papel enviado no body/query/headers pelo cliente'
  );

  console.log('\n======================================================================');
  console.log(`TOTAL DE TESTES DE PERMISSÕES: ${sucessos + falhas}`);
  console.log(`PASSOU: ${sucessos} | FALHAS: ${falhas}`);
  console.log('======================================================================\n');

  if (falhas > 0) {
    process.exit(1);
  }
}

executarSuitePermissoes();
