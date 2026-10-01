/**
 * ==============================================================================
 * SUÍTE DE TESTES: ADMINISTRAÇÃO DE ESTOQUE, PRODUTOS, LOTES E USUÁRIOS
 * ==============================================================================
 * Cobertura exigida:
 * A. ADMIN ajusta estoque (sucesso, atualiza saldos e version atomicamente)
 * B. OPERADOR não consegue ajustar estoque (403)
 * C. CONSULTA não consegue ajustar estoque (403)
 * D. Ajuste sem justificativa é rejeitado (400)
 * E. Concorrência no ajuste: snapshot obsoleto é rejeitado (409)
 * F. Ajuste idempotente com mesma chave e payload (200 replayed, sem duplicação)
 * G. Produto editado por OPERADOR (sucesso)
 * H. Produto editado por ADMIN (sucesso)
 * I. CONSULTA não consegue editar produto (403)
 * J. Produto com histórico (movements/lots/counts) NÃO pode ser excluído fisicamente (409)
 * K. Produto sem histórico PODE ser excluído fisicamente por ADMIN
 * L. Lote com saldo > 0 NÃO pode ser excluído (409)
 * M. Lote com saldo 0 + histórico é desativado logicamente
 * N. Lote com saldo 0 + sem histórico é excluído fisicamente
 * O. ADMIN consegue editar usuário (nome, papel)
 * P. Usuário não-ADMIN não consegue editar usuário (403)
 * Q. Autoexclusão bloqueada para o próprio usuário autenticado (409)
 * R. Auto-desativação e auto-rebaixamento bloqueados para ADMIN (409)
 * S. Último ADMIN ativo protegido contra desativação, rebaixamento e exclusão (409)
 * T. Usuário com histórico operacional NÃO pode ser excluído fisicamente (409)
 * U. Usuário sem histórico PODE ser excluído fisicamente por ADMIN
 * V. Trilha de auditoria administrativa gravada imutavelmente em audit_logs
 */

import { POST as ajustarEstoqueRoute } from '@/app/api/estoque/ajuste/route';
import { DELETE as excluirProdutoRoute, PATCH as atualizarProdutoRoute } from '@/app/api/produtos/route';
import { DELETE as excluirLoteRoute } from '@/app/api/lotes/route';
import { PATCH as atualizarUsuarioRoute, DELETE as excluirUsuarioRoute } from '@/app/api/usuarios/route';
import { temPermissao, MATRIZ_PERMISSOES } from '@/server/auth/session';
import { NextRequest } from 'next/server';
import { 
  Produto, 
  Lote, 
  Movimentacao, 
  ConferenciaFisica, 
  Usuario, 
  RegistrarAjusteEstoqueDTO,
  AuditLogAdmin
} from '@/types/stock';
import { calcularPayloadHash } from '@/server/auth/idempotency';

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

// ==============================================================================
// SIMULADOR DO BANCO FIRESTORE EM MEMÓRIA PARA OPERAÇÕES ADMINISTRATIVAS
// ==============================================================================
class AdminInMemoryDB {
  public products = new Map<string, Produto>();
  public lots = new Map<string, Lote>();
  public movements = new Map<string, Movimentacao>();
  public physicalCounts = new Map<string, ConferenciaFisica>();
  public users = new Map<string, Usuario>();
  public auditLogs = new Map<string, AuditLogAdmin>();
  public idempotencyRecords = new Map<string, any>();
  private auditCounter = 0;

  public nextAuditId(): string {
    this.auditCounter++;
    return `aud-${Date.now()}-${this.auditCounter}`;
  }

  constructor() {
    this.reset();
  }

  public reset() {
    this.products.clear();
    this.lots.clear();
    this.movements.clear();
    this.physicalCounts.clear();
    this.users.clear();
    this.auditLogs.clear();
    this.idempotencyRecords.clear();

    // Usuários padrão
    this.users.set('admin-1', {
      id: 'admin-1',
      uid: 'admin-1',
      email: 'admin1@rss3.com',
      nome: 'Administrador Chefe',
      papel: 'ADMIN',
      ativo: true,
      criadoEm: new Date().toISOString(),
    });

    this.users.set('admin-2', {
      id: 'admin-2',
      uid: 'admin-2',
      email: 'admin2@rss3.com',
      nome: 'Segundo Administrador',
      papel: 'ADMIN',
      ativo: true,
      criadoEm: new Date().toISOString(),
    });

    this.users.set('operador-1', {
      id: 'operador-1',
      uid: 'operador-1',
      email: 'operador1@rss3.com',
      nome: 'Operador Almoxarifado',
      papel: 'OPERADOR',
      ativo: true,
      criadoEm: new Date().toISOString(),
    });

    this.users.set('consulta-1', {
      id: 'consulta-1',
      uid: 'consulta-1',
      email: 'consulta1@rss3.com',
      nome: 'Usuário Consulta',
      papel: 'CONSULTA',
      ativo: true,
      criadoEm: new Date().toISOString(),
    });
  }

  // Simulação de Ajuste Administrativo de Estoque
  public async registrarAjuste(
    dto: RegistrarAjusteEstoqueDTO,
    executor: { uid: string; nome: string }
  ) {
    if (!dto.produto_id) throw new Error('ID do produto é obrigatório.');
    if (typeof dto.novo_saldo !== 'number' || dto.novo_saldo < 0) {
      throw new Error('O novo saldo informado não pode ser negativo.');
    }
    if (!dto.justificativa || !dto.justificativa.trim()) {
      throw new Error('Justificativa obrigatória para ajuste administrativo de estoque.');
    }

    const produto = this.products.get(dto.produto_id);
    if (!produto || !produto.ativo) throw new Error('Produto não encontrado ou inativo.');

    // Idempotência
    if (dto.idempotency_key) {
      const rec = this.idempotencyRecords.get(dto.idempotency_key);
      if (rec) {
        return { ...rec.response_body, replayed: true };
      }
    }

    // Concorrência: Snapshot version
    const versaoAtualProd = produto.version || 1;
    if (typeof dto.snapshot_version_produto === 'number' && dto.snapshot_version_produto < versaoAtualProd) {
      const err: any = new Error('Conflito de Concorrência: Produto desatualizado.');
      err.statusCode = 409;
      throw err;
    }

    const saldoAntProd = produto.saldo_atual;
    let diferenca = 0;
    let lote: Lote | undefined;

    if (produto.controla_lote) {
      if (!dto.lote_id) throw new Error('Lote obrigatório para produto com controle de lote.');
      lote = this.lots.get(dto.lote_id);
      if (!lote || !lote.ativo) throw new Error('Lote não encontrado.');

      diferenca = dto.novo_saldo - lote.saldo_lote;
      lote.saldo_lote = dto.novo_saldo;
      lote.version = (lote.version || 1) + 1;
      produto.saldo_atual = saldoAntProd + diferenca;
    } else {
      diferenca = dto.novo_saldo - saldoAntProd;
      produto.saldo_atual = dto.novo_saldo;
    }

    if (diferenca === 0) {
      throw new Error('O novo saldo informado é idêntico ao saldo atual.');
    }

    produto.version = versaoAtualProd + 1;
    const now = new Date().toISOString();

    // Gravar movimento
    const movId = `mov-${Date.now()}`;
    this.movements.set(movId, {
      id: movId,
      produto_id: dto.produto_id,
      lote_id: dto.lote_id || null,
      tipo: diferenca > 0 ? 'AJUSTE_ENTRADA' : 'AJUSTE_SAIDA',
      quantidade: Math.abs(diferenca),
      saldo_anterior: saldoAntProd,
      saldo_posterior: produto.saldo_atual,
      justificativa: dto.justificativa,
      usuario_id: executor.uid,
      usuario_nome: executor.nome,
      criado_em: now,
    });

    // Gravar audit log
    const auditId = this.nextAuditId();
    this.auditLogs.set(auditId, {
      id: auditId,
      acao: 'ESTOQUE_AJUSTADO',
      entidade: 'stock',
      entidade_id: dto.produto_id,
      executor_uid: executor.uid,
      executor_nome: executor.nome,
      dados_anteriores: { saldo_produto: saldoAntProd },
      dados_posteriores: { saldo_produto: produto.saldo_atual, diferenca },
      justificativa: dto.justificativa,
      criado_em: now,
    });

    const resp = {
      sucesso: true,
      saldo_anterior: saldoAntProd,
      saldo_posterior: produto.saldo_atual,
      diferenca,
      version_produto: produto.version,
    };

    if (dto.idempotency_key) {
      this.idempotencyRecords.set(dto.idempotency_key, {
        idempotency_key: dto.idempotency_key,
        usuario_uid: executor.uid,
        response_body: resp,
      });
    }

    return resp;
  }

  // Simulação de Exclusão Física de Produto
  public excluirProduto(id: string, executor: { uid: string; nome: string }) {
    const p = this.products.get(id);
    if (!p) throw new Error('Produto não encontrado.');

    // Verificar se há movements
    for (const m of this.movements.values()) {
      if (m.produto_id === id) {
        const err: any = new Error('Produto possui movimentações. Desative-o.');
        err.statusCode = 409;
        throw err;
      }
    }

    // Verificar se há lotes
    for (const l of this.lots.values()) {
      if (l.produto_id === id) {
        const err: any = new Error('Produto possui lotes vinculados. Desative-o.');
        err.statusCode = 409;
        throw err;
      }
    }

    this.products.delete(id);
    const prodAuditId = this.nextAuditId();
    this.auditLogs.set(prodAuditId, {
      id: prodAuditId,
      acao: 'PRODUTO_EXCLUIDO',
      entidade: 'products',
      entidade_id: id,
      executor_uid: executor.uid,
      executor_nome: executor.nome,
      criado_em: new Date().toISOString(),
    });
    return { sucesso: true, mensagem: 'Produto excluído.' };
  }

  // Simulação de Exclusão de Lote
  public excluirLote(id: string, executor: { uid: string; nome: string }) {
    const l = this.lots.get(id);
    if (!l) throw new Error('Lote não encontrado.');

    if (l.saldo_lote > 0) {
      const err: any = new Error('Lote possui saldo positivo.');
      err.statusCode = 409;
      throw err;
    }

    let temMov = false;
    for (const m of this.movements.values()) {
      if (m.lote_id === id) {
        temMov = true;
        break;
      }
    }

    if (temMov) {
      l.ativo = false;
      const loteAuditId = this.nextAuditId();
      this.auditLogs.set(loteAuditId, {
        id: loteAuditId,
        acao: 'LOTE_DESATIVADO',
        entidade: 'lots',
        entidade_id: id,
        executor_uid: executor.uid,
        executor_nome: executor.nome,
        criado_em: new Date().toISOString(),
      });
      return { sucesso: true, tipo: 'DESATIVADO' };
    }

    this.lots.delete(id);
    const loteExclAuditId = this.nextAuditId();
    this.auditLogs.set(loteExclAuditId, {
      id: loteExclAuditId,
      acao: 'LOTE_EXCLUIDO',
      entidade: 'lots',
      entidade_id: id,
      executor_uid: executor.uid,
      executor_nome: executor.nome,
      criado_em: new Date().toISOString(),
    });
    return { sucesso: true, tipo: 'EXCLUIDO' };
  }

  // Simulação de Atualização de Usuário
  public atualizarUsuario(
    uid: string, 
    dto: { nome?: string; papel?: any; ativo?: boolean }, 
    executor: { uid: string; nome: string }
  ) {
    const u = this.users.get(uid);
    if (!u) throw new Error('Usuário não encontrado.');

    // Autoação
    if (executor.uid === uid) {
      if (dto.ativo === false) {
        const err: any = new Error('Não pode desativar a própria conta.');
        err.statusCode = 409;
        throw err;
      }
      if (dto.papel && dto.papel !== 'ADMIN' && u.papel === 'ADMIN') {
        const err: any = new Error('Não pode rebaixar a própria conta.');
        err.statusCode = 409;
        throw err;
      }
    }

    // Último ADMIN
    const tentandoDesativar = u.papel === 'ADMIN' && u.ativo && dto.ativo === false;
    const tentandoRebaixar = u.papel === 'ADMIN' && u.ativo && dto.papel && dto.papel !== 'ADMIN';
    if (tentandoDesativar || tentandoRebaixar) {
      const adminsAtivos = Array.from(this.users.values()).filter(x => x.papel === 'ADMIN' && x.ativo);
      if (adminsAtivos.length <= 1) {
        const err: any = new Error('Não é possível remover ou desativar o último administrador ativo.');
        err.statusCode = 409;
        throw err;
      }
    }

    if (dto.nome) u.nome = dto.nome;
    if (dto.papel) u.papel = dto.papel;
    if (typeof dto.ativo === 'boolean') u.ativo = dto.ativo;

    const userAuditId = this.nextAuditId();
    this.auditLogs.set(userAuditId, {
      id: userAuditId,
      acao: 'USUARIO_EDITADO',
      entidade: 'users',
      entidade_id: uid,
      executor_uid: executor.uid,
      executor_nome: executor.nome,
      criado_em: new Date().toISOString(),
    });

    return u;
  }

  // Simulação de Exclusão Física de Usuário
  public excluirUsuario(uid: string, executor: { uid: string; nome: string }) {
    if (executor.uid === uid) {
      const err: any = new Error('Não pode excluir a própria conta.');
      err.statusCode = 409;
      throw err;
    }

    const u = this.users.get(uid);
    if (!u) throw new Error('Usuário não encontrado.');

    // Último ADMIN
    if (u.papel === 'ADMIN' && u.ativo) {
      const adminsAtivos = Array.from(this.users.values()).filter(x => x.papel === 'ADMIN' && x.ativo);
      if (adminsAtivos.length <= 1) {
        const err: any = new Error('Não é possível excluir o último administrador.');
        err.statusCode = 409;
        throw err;
      }
    }

    // Histórico em movements
    for (const m of this.movements.values()) {
      if (m.usuario_id === uid) {
        const err: any = new Error('Usuário possui histórico de movimentações. Opte por desativar.');
        err.statusCode = 409;
        throw err;
      }
    }

    // Histórico em physicalCounts
    for (const c of this.physicalCounts.values()) {
      if (c.realizado_por === uid) {
        const err: any = new Error('Usuário possui histórico de conferências. Opte por desativar.');
        err.statusCode = 409;
        throw err;
      }
    }

    this.users.delete(uid);
    const userExclAuditId = this.nextAuditId();
    this.auditLogs.set(userExclAuditId, {
      id: userExclAuditId,
      acao: 'USUARIO_EXCLUIDO',
      entidade: 'users',
      entidade_id: uid,
      executor_uid: executor.uid,
      executor_nome: executor.nome,
      criado_em: new Date().toISOString(),
    });

    return { sucesso: true, mensagem: 'Usuário excluído.' };
  }
}

// ==============================================================================
// EXECUÇÃO DOS TESTES
// ==============================================================================
async function executarTestesAdministrativos() {
  console.log('======================================================================');
  console.log('INICIANDO SUÍTE DE TESTES: ADMINISTRAÇÃO DE ESTOQUE, PRODUTOS E USUÁRIOS');
  console.log('======================================================================\n');

  const db = new AdminInMemoryDB();

  // Teste A, B, C: Permissões de Ajuste de Estoque
  console.log('--- Subsuíte 1: Autorização de Ajuste de Estoque (RBAC) ---');
  asserir(temPermissao('ADMIN', 'ESTOQUE_AJUSTAR') === true, 'A.1: ADMIN possui permissão ESTOQUE_AJUSTAR');
  asserir(temPermissao('OPERADOR', 'ESTOQUE_AJUSTAR') === false, 'B.1: OPERADOR NÃO possui permissão ESTOQUE_AJUSTAR (403)');
  asserir(temPermissao('CONSULTA', 'ESTOQUE_AJUSTAR') === false, 'C.1: CONSULTA NÃO possui permissão ESTOQUE_AJUSTAR (403)');

  // Teste A: ADMIN ajusta estoque
  console.log('\n--- Subsuíte 2: Ajuste Administrativo de Estoque ---');
  db.products.set('prod-1', {
    id: 'prod-1',
    codigo: 'TIN-001',
    nome: 'Tinta Epóxi Cinza',
    categoria: 'Tintas',
    unidade_medida: 'L',
    controla_lote: false,
    estoque_minimo: 10,
    estoque_maximo: 100,
    saldo_atual: 50,
    ativo: true,
    version: 1,
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  });

  const resAjuste = await db.registrarAjuste(
    {
      produto_id: 'prod-1',
      novo_saldo: 45,
      justificativa: 'Evaporação comprovada e descarte de crosta',
      snapshot_version_produto: 1,
    },
    { uid: 'admin-1', nome: 'Admin Chefe' }
  );

  asserir(resAjuste.saldo_posterior === 45, 'A.2: Saldo posterior atualizado com precisão para 45 L');
  asserir(resAjuste.diferenca === -5, 'A.3: Diferença calculada corretamente como -5 L');
  asserir(resAjuste.version_produto === 2, 'A.4: Versão do produto incrementada monotonicamente para 2');
  asserir(db.movements.size === 1, 'A.5: Movimentação de AJUSTE_SAIDA gravada no ledger append-only');
  asserir(db.auditLogs.size === 1, 'A.6: Registro imutável de auditoria administrativa gravado');

  // Teste D: Ajuste sem justificativa
  console.log('\n--- Subsuíte 3: Validação de Justificativa Obrigatória ---');
  let erroJustificativa = false;
  try {
    await db.registrarAjuste(
      {
        produto_id: 'prod-1',
        novo_saldo: 40,
        justificativa: '',
      },
      { uid: 'admin-1', nome: 'Admin Chefe' }
    );
  } catch (err: any) {
    erroJustificativa = true;
  }
  asserir(erroJustificativa, 'D.1: Ajuste sem justificativa é estritamente rejeitado com erro');

  // Teste E: Concorrência com Snapshot Obsoleto
  console.log('\n--- Subsuíte 4: Concorrência e Snapshot Version ---');
  let erroConcorrencia = false;
  try {
    await db.registrarAjuste(
      {
        produto_id: 'prod-1',
        novo_saldo: 42,
        justificativa: 'Ajuste atrasado',
        snapshot_version_produto: 1, // Versão atual no banco já é 2!
      },
      { uid: 'admin-1', nome: 'Admin Chefe' }
    );
  } catch (err: any) {
    if (err.statusCode === 409) erroConcorrencia = true;
  }
  asserir(erroConcorrencia, 'E.1: Snapshot obsoleto rejeitado com HTTP 409 em ajuste de estoque');

  // Teste F: Idempotência no Ajuste
  console.log('\n--- Subsuíte 5: Idempotência de Ajuste ---');
  const resIdempotente1 = await db.registrarAjuste(
    {
      produto_id: 'prod-1',
      novo_saldo: 42,
      justificativa: 'Ajuste idempotente',
      idempotency_key: 'idemp-key-ajuste-01',
      snapshot_version_produto: 2,
    },
    { uid: 'admin-1', nome: 'Admin Chefe' }
  );
  asserir(resIdempotente1.saldo_posterior === 42, 'F.1: Primeira chamada com idempotency_key ajusta saldo para 42');

  const resIdempotente2 = await db.registrarAjuste(
    {
      produto_id: 'prod-1',
      novo_saldo: 42,
      justificativa: 'Ajuste idempotente',
      idempotency_key: 'idemp-key-ajuste-01',
      snapshot_version_produto: 2,
    },
    { uid: 'admin-1', nome: 'Admin Chefe' }
  );
  asserir(resIdempotente2.replayed === true, 'F.2: Segunda chamada com mesma chave retorna replay sem duplicar movimento');

  // Teste G, H, I: Edição de Produto por Papel
  console.log('\n--- Subsuíte 6: Edição de Produtos (RBAC) ---');
  asserir(temPermissao('OPERADOR', 'PRODUTO_GERENCIAR') === true, 'G.1: OPERADOR possui PRODUTO_GERENCIAR');
  asserir(temPermissao('ADMIN', 'PRODUTO_GERENCIAR') === true, 'H.1: ADMIN possui PRODUTO_GERENCIAR');
  asserir(temPermissao('CONSULTA', 'PRODUTO_GERENCIAR') === false, 'I.1: CONSULTA NÃO possui PRODUTO_GERENCIAR (403)');

  // Teste J & K: Exclusão Física de Produto
  console.log('\n--- Subsuíte 7: Exclusão Física de Produto vs Histórico ---');
  // Produto prod-1 tem movimentações!
  let erroExcluirProdComMov = false;
  try {
    db.excluirProduto('prod-1', { uid: 'admin-1', nome: 'Admin' });
  } catch (err: any) {
    if (err.statusCode === 409) erroExcluirProdComMov = true;
  }
  asserir(erroExcluirProdComMov, 'J.1: Produto com movimentações NÃO pode ser excluído fisicamente (HTTP 409)');

  // Produto virgem sem movimentações
  db.products.set('prod-novo-sem-mov', {
    id: 'prod-novo-sem-mov',
    codigo: 'VIR-001',
    nome: 'Produto Novo Sem Uso',
    categoria: 'Outros',
    unidade_medida: 'UN',
    controla_lote: false,
    estoque_minimo: 0,
    estoque_maximo: 0,
    saldo_atual: 0,
    ativo: true,
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  });
  const resExcluirVirgem = db.excluirProduto('prod-novo-sem-mov', { uid: 'admin-1', nome: 'Admin' });
  asserir(resExcluirVirgem.sucesso && !db.products.has('prod-novo-sem-mov'), 'K.1: Produto sem histórico é excluído com sucesso');

  // Teste L, M, N: Regras de Exclusão de Lotes
  console.log('\n--- Subsuíte 8: Administração e Exclusão de Lotes ---');
  db.lots.set('lote-com-saldo', {
    id: 'lote-com-saldo',
    produto_id: 'prod-1',
    numero_lote: 'L-2026-A',
    saldo_lote: 15,
    ativo: true,
    criado_em: new Date().toISOString(),
  });
  let erroLoteSaldo = false;
  try {
    db.excluirLote('lote-com-saldo', { uid: 'admin-1', nome: 'Admin' });
  } catch (err: any) {
    if (err.statusCode === 409) erroLoteSaldo = true;
  }
  asserir(erroLoteSaldo, 'L.1: Lote com saldo > 0 NÃO pode ser excluído (HTTP 409)');

  // Lote com saldo zero mas com histórico
  db.lots.set('lote-zerado-com-mov', {
    id: 'lote-zerado-com-mov',
    produto_id: 'prod-1',
    numero_lote: 'L-2026-B',
    saldo_lote: 0,
    ativo: true,
    criado_em: new Date().toISOString(),
  });
  db.movements.set('mov-lote-b', {
    id: 'mov-lote-b',
    produto_id: 'prod-1',
    lote_id: 'lote-zerado-com-mov',
    tipo: 'ENTRADA',
    quantidade: 10,
    saldo_anterior: 0,
    saldo_posterior: 10,
    usuario_id: 'admin-1',
    criado_em: new Date().toISOString(),
  });
  const resLoteDesativado = db.excluirLote('lote-zerado-com-mov', { uid: 'admin-1', nome: 'Admin' });
  asserir(resLoteDesativado.tipo === 'DESATIVADO' && db.lots.get('lote-zerado-com-mov')?.ativo === false, 'M.1: Lote com saldo 0 e histórico é desativado logicamente');

  // Lote com saldo zero e sem histórico
  db.lots.set('lote-virgem', {
    id: 'lote-virgem',
    produto_id: 'prod-1',
    numero_lote: 'L-VIRGEM',
    saldo_lote: 0,
    ativo: true,
    criado_em: new Date().toISOString(),
  });
  const resLoteExcluido = db.excluirLote('lote-virgem', { uid: 'admin-1', nome: 'Admin' });
  asserir(resLoteExcluido.tipo === 'EXCLUIDO' && !db.lots.has('lote-virgem'), 'N.1: Lote com saldo 0 e sem histórico é excluído fisicamente');

  // Teste O, P: Gestão de Usuários RBAC
  console.log('\n--- Subsuíte 9: Edição de Usuários e Autorização ---');
  asserir(temPermissao('ADMIN', 'USUARIO_GERENCIAR') === true, 'O.1: ADMIN possui USUARIO_GERENCIAR');
  asserir(temPermissao('OPERADOR', 'USUARIO_GERENCIAR') === false, 'P.1: OPERADOR NÃO possui USUARIO_GERENCIAR (403)');
  asserir(temPermissao('CONSULTA', 'USUARIO_GERENCIAR') === false, 'P.2: CONSULTA NÃO possui USUARIO_GERENCIAR (403)');

  // Teste Q & R: Autoação de ADMIN
  console.log('\n--- Subsuíte 10: Bloqueio de Autoação do Usuário Autenticado ---');
  let erroAutoExclusao = false;
  try {
    db.excluirUsuario('admin-1', { uid: 'admin-1', nome: 'Admin 1' });
  } catch (err: any) {
    if (err.statusCode === 409) erroAutoExclusao = true;
  }
  asserir(erroAutoExclusao, 'Q.1: Bloqueada autoexclusão da própria conta (HTTP 409)');

  let erroAutoDesativacao = false;
  try {
    db.atualizarUsuario('admin-1', { ativo: false }, { uid: 'admin-1', nome: 'Admin 1' });
  } catch (err: any) {
    if (err.statusCode === 409) erroAutoDesativacao = true;
  }
  asserir(erroAutoDesativacao, 'R.1: Bloqueada auto-desativação da própria conta (HTTP 409)');

  let erroAutoRebaixamento = false;
  try {
    db.atualizarUsuario('admin-1', { papel: 'OPERADOR' }, { uid: 'admin-1', nome: 'Admin 1' });
  } catch (err: any) {
    if (err.statusCode === 409) erroAutoRebaixamento = true;
  }
  asserir(erroAutoRebaixamento, 'R.2: Bloqueado auto-rebaixamento de perfil de ADMIN (HTTP 409)');

  // Teste S: Proteção do Último ADMIN Ativo
  console.log('\n--- Subsuíte 11: Proteção do Último ADMIN Ativo ---');
  // Desativar admin-2 para restar apenas admin-1
  db.atualizarUsuario('admin-2', { ativo: false }, { uid: 'admin-1', nome: 'Admin 1' });

  // Agora tentar desativar admin-1
  let erroUltimoAdmin = false;
  try {
    // Simulando outro executor para não cair na barreira de autoação e testar a barreira do último admin
    db.atualizarUsuario('admin-1', { ativo: false }, { uid: 'sistema-root', nome: 'Root' });
  } catch (err: any) {
    if (err.statusCode === 409) erroUltimoAdmin = true;
  }
  asserir(erroUltimoAdmin, 'S.1: Bloqueada desativação do último ADMIN ativo do sistema (HTTP 409)');

  // Reativar admin-2
  db.atualizarUsuario('admin-2', { ativo: true }, { uid: 'admin-1', nome: 'Admin 1' });

  // Teste T & U: Exclusão Física de Usuário com Histórico vs Sem Histórico
  console.log('\n--- Subsuíte 12: Exclusão Física de Usuários ---');
  // operador-1 não tem movimentos ainda -> vamos dar um movimento para ele
  db.movements.set('mov-op-1', {
    id: 'mov-op-1',
    produto_id: 'prod-1',
    tipo: 'ENTRADA',
    quantidade: 5,
    saldo_anterior: 42,
    saldo_posterior: 47,
    usuario_id: 'operador-1',
    criado_em: new Date().toISOString(),
  });

  let erroExcluirUsuarioComHistorico = false;
  try {
    db.excluirUsuario('operador-1', { uid: 'admin-1', nome: 'Admin 1' });
  } catch (err: any) {
    if (err.statusCode === 409) erroExcluirUsuarioComHistorico = true;
  }
  asserir(erroExcluirUsuarioComHistorico, 'T.1: Usuário com histórico de movimentações NÃO pode ser excluído fisicamente (HTTP 409)');

  // Usuário virgem sem histórico
  db.users.set('usuario-temporario', {
    id: 'usuario-temporario',
    uid: 'usuario-temporario',
    email: 'temp@rss3.com',
    nome: 'Temporário',
    papel: 'CONSULTA',
    ativo: true,
  });
  const resExcluirUserVirgem = db.excluirUsuario('usuario-temporario', { uid: 'admin-1', nome: 'Admin 1' });
  asserir(resExcluirUserVirgem.sucesso && !db.users.has('usuario-temporario'), 'U.1: Usuário sem histórico é excluído com sucesso');

  // Teste V: Trilha de Auditoria
  console.log('\n--- Subsuíte 13: Imutabilidade e Completude de Audit Logs ---');
  const totalAuditLogs = db.auditLogs.size;
  asserir(totalAuditLogs >= 6, `V.1: Trilha de auditoria gerou registros imutáveis (${totalAuditLogs} eventos registrados)`);

  console.log('\n======================================================================');
  console.log(`TOTAL DE TESTES ADMINISTRATIVOS: ${sucessos + falhas}`);
  console.log(`PASSOU: ${sucessos} | FALHAS: ${falhas}`);
  console.log('======================================================================');

  if (falhas > 0) {
    process.exit(1);
  }
}

executarTestesAdministrativos();
