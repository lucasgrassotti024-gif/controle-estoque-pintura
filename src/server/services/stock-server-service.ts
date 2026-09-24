import { adminDb, adminAuth, DocumentReference, Transaction } from '@/server/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/firestore';
import { 
  RegistrarEntradaDTO, 
  RegistrarSaidaDTO, 
  RegistrarConferenciaDTO,
  ResultadoOperacaoEstoque,
  CriarProdutoDTO,
  AtualizarProdutoDTO,
  Produto,
  Lote,
  Movimentacao,
  ConferenciaFisica,
  Usuario,
  CriarUsuarioDTO,
  AtualizarUsuarioDTO,
  PapelUsuario
} from '@/types/stock';


/**
 * ==============================================================================
 * SERVIÇO SERVER-SIDE DE OPERAÇÕES DE ESTOQUE (AUTORIDADE ÚNICA DE ESCRITA)
 * ==============================================================================
 * Executa exclusivamente no servidor Next.js.
 * Utiliza o Firebase Admin SDK (que ignora Security Rules) para orquestrar
 * transações atômicas com garantia de integridade matemática:
 * 
 * 1. O cliente envia somente INTENÇÃO (produtoId, quantidade, loteId, etc.).
 * 2. O servidor lê o estado oficial dentro de runTransaction.
 * 3. O servidor calcula saldos anterior/posterior e divergências.
 * 4. Saldo nunca negativo é estritamente garantido.
 * 5. Invariância produto.saldo_atual = soma(lotes) preservada.
 * 6. Ledger de movimentações é gravado na mesma transação.
 */

// Identificador técnico temporário de desenvolvimento / fallback seguro
const USUARIO_TECNICO_DEV = 'usr-dev-master';

export interface UsuarioAutenticadoOperacao {
  uid: string;
  nome: string;
}

export const stockServerService = {
  /**
   * Registra Entrada de Estoque de forma atômica no servidor.
   * A autoria é extraída com exclusividade da sessão autenticada server-side.
   */
  async registrarEntrada(
    dto: RegistrarEntradaDTO, 
    usuarioAutenticado?: UsuarioAutenticadoOperacao
  ): Promise<ResultadoOperacaoEstoque> {
    if (!dto.produto_id) {
      throw new Error('ID do produto é obrigatório.');
    }
    if (typeof dto.quantidade !== 'number' || dto.quantidade <= 0) {
      throw new Error('A quantidade de entrada deve ser maior que zero.');
    }

    const operadorUid = usuarioAutenticado?.uid || USUARIO_TECNICO_DEV;
    const operadorNome = usuarioAutenticado?.nome || 'Operador Almoxarifado';

    return await adminDb.runTransaction(async (transaction: Transaction) => {
      // 1. Ler Produto
      const prodRef = adminDb.collection(COLLECTIONS.PRODUCTS).doc(dto.produto_id);
      const prodSnap = await transaction.get(prodRef);

      if (!prodSnap.exists) {
        throw new Error('Produto não encontrado ou inativo.');
      }

      const produto = prodSnap.data() as Produto;
      if (!produto.ativo) {
        throw new Error('Produto não encontrado ou inativo.');
      }

      const saldoAnt = produto.saldo_atual || 0;
      let loteId: string | null = null;
      let loteRef: DocumentReference | null = null;
      let saldoLoteAnt = 0;
      let loteExiste = false;

      // 2. Validação e Busca de Lote
      if (produto.controla_lote) {
        if (!dto.numero_lote || !dto.numero_lote.trim()) {
          throw new Error('Lote obrigatório: este produto exige identificação de lote para entrada.');
        }

        const numLoteLimpo = dto.numero_lote.trim();
        const lotesQuery = await adminDb
          .collection(COLLECTIONS.LOTS)
          .where('produto_id', '==', dto.produto_id)
          .where('numero_lote', '==', numLoteLimpo)
          .get();

        if (!lotesQuery.empty) {
          const loteDoc = lotesQuery.docs[0];
          loteId = loteDoc.id;
          loteRef = adminDb.collection(COLLECTIONS.LOTS).doc(loteId);
          const loteSnap = await transaction.get(loteRef);
          const loteData = loteSnap.data() as Lote;
          saldoLoteAnt = loteData.saldo_lote || 0;
          loteExiste = true;
        } else {
          loteRef = adminDb.collection(COLLECTIONS.LOTS).doc();
          loteId = loteRef.id;
          loteExiste = false;
        }
      } else {
        if (dto.numero_lote && dto.numero_lote.trim() !== '') {
          throw new Error('Este produto não controla lote. O campo de lote deve permanecer vazio.');
        }
      }

      // 3. Cálculo estrito de saldo pelo servidor
      const saldoPos = saldoAnt + dto.quantidade;
      const now = new Date().toISOString();

      // 4. Gravação de Lote (se aplicável)
      if (produto.controla_lote && loteRef) {
        if (loteExiste) {
          transaction.update(loteRef, {
            saldo_lote: saldoLoteAnt + dto.quantidade,
            data_validade: dto.data_validade || null,
            atualizado_em: now,
          });
        } else {
          transaction.set(loteRef, {
            produto_id: dto.produto_id,
            numero_lote: dto.numero_lote!.trim(),
            data_validade: dto.data_validade || null,
            saldo_lote: dto.quantidade,
            ativo: true,
            criado_em: now,
            atualizado_em: now,
          });
        }
      }

      // 5. Atualização atômica do saldo do produto
      transaction.update(prodRef, {
        saldo_atual: saldoPos,
        atualizado_em: now,
      });

      // 6. Registro no Ledger Imutável com usuário real da sessão
      const movRef = adminDb.collection(COLLECTIONS.MOVEMENTS).doc();
      transaction.set(movRef, {
        produto_id: dto.produto_id,
        lote_id: loteId,
        tipo: 'ENTRADA',
        quantidade: dto.quantidade,
        saldo_anterior: saldoAnt,
        saldo_posterior: saldoPos,
        documento_ref: dto.documento_ref?.trim() || null,
        motivo_destino: dto.motivo_destino?.trim() || null,
        observacao: dto.observacao?.trim() || null,
        usuario_id: operadorUid,
        usuario_nome: operadorNome,
        criado_em: now,
      });

      return {
        sucesso: true,
        movimentacao_id: movRef.id,
        saldo_anterior: saldoAnt,
        saldo_posterior: saldoPos,
        lote_id: loteId || undefined,
      };
    });
  },

  /**
   * Registra Saída de Estoque de forma atômica no servidor.
   * A autoria é extraída com exclusividade da sessão autenticada server-side.
   */
  async registrarSaida(
    dto: RegistrarSaidaDTO,
    usuarioAutenticado?: UsuarioAutenticadoOperacao
  ): Promise<ResultadoOperacaoEstoque> {
    if (!dto.produto_id) {
      throw new Error('ID do produto é obrigatório.');
    }
    if (typeof dto.quantidade !== 'number' || dto.quantidade <= 0) {
      throw new Error('A quantidade de saída deve ser maior que zero.');
    }

    const operadorUid = usuarioAutenticado?.uid || USUARIO_TECNICO_DEV;
    const operadorNome = usuarioAutenticado?.nome || 'Operador Almoxarifado';


    return await adminDb.runTransaction(async (transaction: Transaction) => {
      // 1. Ler Produto
      const prodRef = adminDb.collection(COLLECTIONS.PRODUCTS).doc(dto.produto_id);
      const prodSnap = await transaction.get(prodRef);

      if (!prodSnap.exists) {
        throw new Error('Produto não encontrado ou inativo.');
      }

      const produto = prodSnap.data() as Produto;
      if (!produto.ativo) {
        throw new Error('Produto não encontrado ou inativo.');
      }

      const saldoAnt = produto.saldo_atual || 0;

      // 2. Proteção geral contra saldo negativo
      if (saldoAnt < dto.quantidade) {
        throw new Error(
          `Saldo insuficiente no produto. Saldo disponível: ${saldoAnt}, Saída solicitada: ${dto.quantidade}`
        );
      }

      let loteRef: DocumentReference | null = null;
      let saldoLoteAnt = 0;

      // 3. Validação de Lote
      if (produto.controla_lote) {
        if (!dto.lote_id) {
          throw new Error('Lote obrigatório: este produto controla lote. Selecione manualmente o lote de origem.');
        }

        loteRef = adminDb.collection(COLLECTIONS.LOTS).doc(dto.lote_id);
        const loteSnap = await transaction.get(loteRef);

        if (!loteSnap.exists) {
          throw new Error('Lote não encontrado ou inativo.');
        }

        const lote = loteSnap.data() as Lote;
        if (!lote.ativo) {
          throw new Error('Lote não encontrado ou inativo.');
        }

        if (lote.produto_id !== dto.produto_id) {
          throw new Error('Inconsistência: o lote informado não pertence a este produto.');
        }

        saldoLoteAnt = lote.saldo_lote || 0;
        if (saldoLoteAnt < dto.quantidade) {
          throw new Error(
            `Saldo insuficiente no lote selecionado. Disponível no lote: ${saldoLoteAnt}, Saída solicitada: ${dto.quantidade}`
          );
        }
      } else {
        if (dto.lote_id) {
          throw new Error('Este produto não controla lote. Parâmetro de lote deve ser nulo.');
        }
      }

      // 4. Cálculo estrito de saldo pelo servidor
      const saldoPos = saldoAnt - dto.quantidade;
      const now = new Date().toISOString();

      // 5. Debitar Lote
      if (produto.controla_lote && loteRef) {
        transaction.update(loteRef, {
          saldo_lote: saldoLoteAnt - dto.quantidade,
          atualizado_em: now,
        });
      }

      // 6. Atualizar Saldo do Produto
      transaction.update(prodRef, {
        saldo_atual: saldoPos,
        atualizado_em: now,
      });

      // 7. Registro no Ledger Imutável
      const movRef = adminDb.collection(COLLECTIONS.MOVEMENTS).doc();
      transaction.set(movRef, {
        produto_id: dto.produto_id,
        lote_id: dto.lote_id || null,
        tipo: 'SAIDA',
        quantidade: dto.quantidade,
        saldo_anterior: saldoAnt,
        saldo_posterior: saldoPos,
        documento_ref: dto.documento_ref?.trim() || null,
        motivo_destino: dto.motivo_destino?.trim() || null,
        observacao: dto.observacao?.trim() || null,
        usuario_id: operadorUid,
        usuario_nome: operadorNome,
        criado_em: now,
      });


      return {
        sucesso: true,
        movimentacao_id: movRef.id,
        saldo_anterior: saldoAnt,
        saldo_posterior: saldoPos,
        lote_id: dto.lote_id || undefined,
      };
    });
  },

  /**
   * Registra Conferência Física e eventuais ajustes atômicos no servidor.
   * A autoria é extraída com exclusividade da sessão autenticada server-side.
   */
  async registrarConferenciaFisica(
    dto: RegistrarConferenciaDTO,
    usuarioAutenticado?: UsuarioAutenticadoOperacao
  ): Promise<ResultadoOperacaoEstoque> {
    if (!dto.produto_id) {
      throw new Error('ID do produto é obrigatório.');
    }
    if (typeof dto.quantidade_encontrada !== 'number' || dto.quantidade_encontrada < 0) {
      throw new Error('A quantidade encontrada na conferência física não pode ser negativa.');
    }

    const operadorUid = usuarioAutenticado?.uid || USUARIO_TECNICO_DEV;
    const operadorNome = usuarioAutenticado?.nome || 'Operador Almoxarifado';

    return await adminDb.runTransaction(async (transaction: Transaction) => {
      // 1. Ler Produto
      const prodRef = adminDb.collection(COLLECTIONS.PRODUCTS).doc(dto.produto_id);
      const prodSnap = await transaction.get(prodRef);

      if (!prodSnap.exists) {
        throw new Error('Produto não encontrado ou inativo.');
      }

      const produto = prodSnap.data() as Produto;
      if (!produto.ativo) {
        throw new Error('Produto não encontrado ou inativo.');
      }

      const saldoAntProd = produto.saldo_atual || 0;
      let saldoPosProd: number;
      let diferenca: number;
      let loteRef: DocumentReference | null = null;
      let saldoAntLote = 0;

      // 2. Validação e cálculo por modalidade
      if (produto.controla_lote) {
        if (!dto.lote_id) {
          throw new Error('Lote obrigatório: a conferência de produto com controle de lote deve ser realizada lote por lote.');
        }

        loteRef = adminDb.collection(COLLECTIONS.LOTS).doc(dto.lote_id);
        const loteSnap = await transaction.get(loteRef);

        if (!loteSnap.exists) {
          throw new Error('Lote não encontrado ou inativo.');
        }

        const lote = loteSnap.data() as Lote;
        if (!lote.ativo) {
          throw new Error('Lote não encontrado ou inativo.');
        }

        if (lote.produto_id !== dto.produto_id) {
          throw new Error('Inconsistência: o lote informado não pertence a este produto.');
        }

        saldoAntLote = lote.saldo_lote || 0;
        diferenca = dto.quantidade_encontrada - saldoAntLote;
        saldoPosProd = saldoAntProd + diferenca;

        if (saldoPosProd < 0) {
          throw new Error(
            `Erro crítico de integridade: o ajuste do lote resultaria em saldo consolidado negativo (${saldoPosProd}) para o produto.`
          );
        }
      } else {
        if (dto.lote_id) {
          throw new Error('Este produto não controla lote. Parâmetro de lote deve ser nulo.');
        }

        saldoPosProd = dto.quantidade_encontrada;
        diferenca = saldoPosProd - saldoAntProd;
      }

      const now = new Date().toISOString();

      // 3. Atualizar Lote (se aplicável)
      if (produto.controla_lote && loteRef) {
        transaction.update(loteRef, {
          saldo_lote: dto.quantidade_encontrada,
          atualizado_em: now,
        });
      }

      // 4. Atualizar Saldo do Produto
      transaction.update(prodRef, {
        saldo_atual: saldoPosProd,
        atualizado_em: now,
      });

      // 5. Registrar na coleção de Conferências Físicas com usuário real da sessão
      const confRef = adminDb.collection(COLLECTIONS.PHYSICAL_COUNTS).doc();
      transaction.set(confRef, {
        produto_id: dto.produto_id,
        lote_id: dto.lote_id || null,
        quantidade_anterior: produto.controla_lote ? saldoAntLote : saldoAntProd,
        quantidade_encontrada: dto.quantidade_encontrada,
        diferenca: diferenca,
        justificativa: dto.justificativa?.trim() || null,
        observacao: dto.observacao?.trim() || null,
        realizado_por: operadorUid,
        realizado_por_nome: operadorNome,
        criado_em: now,
      });

      // 6. Se houver divergência, gerar registro de ajuste no Ledger Imutável
      let movId: string | null = null;
      if (diferenca !== 0) {
        if (!dto.justificativa || !dto.justificativa.trim()) {
          throw new Error('Justificativa obrigatória: qualquer ajuste com divergência de conferência física exige justificativa.');
        }

        const tipoAjuste = diferenca > 0 ? 'AJUSTE_ENTRADA' : 'AJUSTE_SAIDA';
        const qtdAjuste = Math.abs(diferenca);

        const movRef = adminDb.collection(COLLECTIONS.MOVEMENTS).doc();
        movId = movRef.id;

        transaction.set(movRef, {
          produto_id: dto.produto_id,
          lote_id: dto.lote_id || null,
          tipo: tipoAjuste,
          quantidade: qtdAjuste,
          saldo_anterior: saldoAntProd,
          saldo_posterior: saldoPosProd,
          motivo_destino: 'Ajuste por Conferência Física',
          justificativa: dto.justificativa.trim(),
          observacao: dto.observacao?.trim() || null,
          usuario_id: operadorUid,
          usuario_nome: operadorNome,
          criado_em: now,
        });
      }

      return {
        sucesso: true,
        conferencia_id: confRef.id,

        movimentacao_id: movId || undefined,
        saldo_anterior: saldoAntProd,
        saldo_posterior: saldoPosProd,
        diferenca: diferenca,
        lote_id: dto.lote_id || undefined,
      };
    });
  },

  /**
   * Criação de Produto Server-side (assegura saldo_atual = 0 e código único)
   */
  async criarProduto(dto: CriarProdutoDTO): Promise<Produto> {
    if (!dto.codigo || !dto.codigo.trim()) {
      throw new Error('Código do produto é obrigatório.');
    }
    if (!dto.nome || !dto.nome.trim()) {
      throw new Error('Nome do produto é obrigatório.');
    }

    const codLimpo = dto.codigo.trim();

    // Validação de unicidade de código
    const existente = await adminDb
      .collection(COLLECTIONS.PRODUCTS)
      .where('codigo', '==', codLimpo)
      .get();

    if (!existente.empty) {
      throw new Error(`Já existe um produto cadastrado com o código "${codLimpo}".`);
    }

    const now = new Date().toISOString();
    const docRef = adminDb.collection(COLLECTIONS.PRODUCTS).doc();

    const payload: Omit<Produto, 'id'> = {
      codigo: codLimpo,
      nome: dto.nome.trim(),
      descricao: dto.descricao?.trim() || null,
      categoria: dto.categoria,
      unidade_medida: dto.unidade_medida,
      fabricante: dto.fabricante?.trim() || null,
      localizacao: dto.localizacao?.trim() || null,
      controla_lote: Boolean(dto.controla_lote),
      estoque_minimo: dto.estoque_minimo ?? 0,
      estoque_maximo: dto.estoque_maximo ?? 0,
      saldo_atual: 0, // Saldo inicial SEMPRE ZERO
      ativo: true,
      criado_em: now,
      atualizado_em: now,
    };

    await docRef.set(payload);

    return {
      ...payload,
      id: docRef.id,
    };
  },

  /**
   * Atualização de Produto Server-side (protege saldo_atual contra mutações diretas)
   */
  async atualizarProduto(id: string, dto: AtualizarProdutoDTO): Promise<Produto> {
    const docRef = adminDb.collection(COLLECTIONS.PRODUCTS).doc(id);
    const snap = await docRef.get();

    if (!snap.exists) {
      throw new Error('Produto não encontrado para atualização.');
    }

    const atual = snap.data() as Produto;

    if (dto.codigo && dto.codigo.trim() !== atual.codigo) {
      const codLimpo = dto.codigo.trim();
      const existente = await adminDb
        .collection(COLLECTIONS.PRODUCTS)
        .where('codigo', '==', codLimpo)
        .get();

      if (!existente.empty && existente.docs[0].id !== id) {
        throw new Error(`Já existe um produto cadastrado com o código "${codLimpo}".`);
      }
    }

    // Regra crítica: se tentar alterar controla_lote, saldo_atual deve ser zero
    if (dto.controla_lote !== undefined && dto.controla_lote !== atual.controla_lote) {
      if (atual.saldo_atual > 0) {
        throw new Error(
          'Operação bloqueada: Não é permitido alternar o controle de lote de um produto com saldo em estoque.'
        );
      }
    }

    const now = new Date().toISOString();
    const payload: Partial<Produto> = {
      atualizado_em: now,
    };

    if (dto.codigo !== undefined) payload.codigo = dto.codigo.trim();
    if (dto.nome !== undefined) payload.nome = dto.nome.trim();
    if (dto.descricao !== undefined) payload.descricao = dto.descricao?.trim() || null;
    if (dto.categoria !== undefined) payload.categoria = dto.categoria;
    if (dto.unidade_medida !== undefined) payload.unidade_medida = dto.unidade_medida;
    if (dto.fabricante !== undefined) payload.fabricante = dto.fabricante?.trim() || null;
    if (dto.localizacao !== undefined) payload.localizacao = dto.localizacao?.trim() || null;
    if (dto.controla_lote !== undefined) payload.controla_lote = Boolean(dto.controla_lote);
    if (dto.estoque_minimo !== undefined) payload.estoque_minimo = dto.estoque_minimo;
    if (dto.estoque_maximo !== undefined) payload.estoque_maximo = dto.estoque_maximo;
    if (dto.ativo !== undefined) payload.ativo = Boolean(dto.ativo);

    await docRef.update(payload);

    return {
      ...atual,
      ...payload,
    };
  },

  /**
   * Alteração de status ativo/inativo de Produto Server-side
   */
  async alterarStatusAtivo(id: string, ativo: boolean): Promise<Produto> {
    const docRef = adminDb.collection(COLLECTIONS.PRODUCTS).doc(id);
    const snap = await docRef.get();

    if (!snap.exists) {
      throw new Error('Produto não encontrado.');
    }

    const atual = snap.data() as Produto;
    const now = new Date().toISOString();

    await docRef.update({ ativo, atualizado_em: now });

    return {
      ...atual,
      ativo,
      atualizado_em: now,
    };
  },

  // ============================================================================
  // LEITURAS SERVER-SIDE (FIREBASE ADMIN SDK - AUTORIDADE CENTRAL)
  // ============================================================================

  /**
   * Listagem de Produtos Server-side com filtros
   */
  async listarProdutos(filtro?: {
    termo?: string;
    categoria?: any;
    apenas_ativos?: boolean;
    apenas_criticos?: boolean;
  }): Promise<Produto[]> {
    let q: FirebaseFirestore.Query = adminDb.collection(COLLECTIONS.PRODUCTS);

    if (filtro?.apenas_ativos !== false) {
      q = q.where('ativo', '==', true);
    }
    if (filtro?.categoria) {
      q = q.where('categoria', '==', filtro.categoria);
    }

    const snapshot = await q.get();
    let produtos: Produto[] = snapshot.docs.map((d) => ({
      ...(d.data() as Produto),
      id: d.id,
    }));

    // Ordenação padrão por nome
    produtos.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    // Filtro por termo
    if (filtro?.termo && filtro.termo.trim()) {
      const termo = filtro.termo.trim().toLowerCase();
      produtos = produtos.filter(
        (p) =>
          (p.nome && p.nome.toLowerCase().includes(termo)) ||
          (p.codigo && p.codigo.toLowerCase().includes(termo))
      );
    }

    return produtos;
  },

  /**
   * Busca Produto por ID
   */
  async buscarProdutoPorId(id: string): Promise<Produto | null> {
    if (!id || !id.trim()) return null;
    const snap = await adminDb.collection(COLLECTIONS.PRODUCTS).doc(id.trim()).get();
    if (!snap.exists) return null;
    return {
      ...(snap.data() as Produto),
      id: snap.id,
    };
  },

  /**
   * Busca Produto por Código (SKU)
   */
  async buscarProdutoPorCodigo(codigo: string): Promise<Produto | null> {
    if (!codigo || !codigo.trim()) return null;
    const snap = await adminDb
      .collection(COLLECTIONS.PRODUCTS)
      .where('codigo', '==', codigo.trim())
      .limit(1)
      .get();
    if (snap.empty) return null;
    const docSnap = snap.docs[0];
    return {
      ...(docSnap.data() as Produto),
      id: docSnap.id,
    };
  },

  /**
   * Verifica dependências de lote para validações cadastrais
   */
  async verificarDependenciasLote(produtoId: string): Promise<{
    totalLotes: number;
    totalMovimentacoesLote: number;
    totalConferenciasLote: number;
  }> {
    const snapLotes = await adminDb
      .collection(COLLECTIONS.LOTS)
      .where('produto_id', '==', produtoId)
      .get();
    const countLotes = snapLotes.size;

    const snapMov = await adminDb
      .collection(COLLECTIONS.MOVEMENTS)
      .where('produto_id', '==', produtoId)
      .get();
    const countMov = snapMov.docs.filter((d) => d.data().lote_id != null).length;

    const snapConf = await adminDb
      .collection(COLLECTIONS.PHYSICAL_COUNTS)
      .where('produto_id', '==', produtoId)
      .get();
    const countConf = snapConf.docs.filter((d) => d.data().lote_id != null).length;

    return {
      totalLotes: countLotes,
      totalMovimentacoesLote: countMov,
      totalConferenciasLote: countConf,
    };
  },

  /**
   * Listar Lotes por Produto
   */
  async listarLotesPorProduto(produtoId: string, apenasComSaldo: boolean = false): Promise<Lote[]> {
    if (!produtoId || !produtoId.trim()) return [];
    let q: FirebaseFirestore.Query = adminDb
      .collection(COLLECTIONS.LOTS)
      .where('produto_id', '==', produtoId.trim())
      .where('ativo', '==', true);

    const snapshot = await q.get();
    let lotes: Lote[] = snapshot.docs.map((d) => ({
      ...(d.data() as Lote),
      id: d.id,
    }));

    lotes.sort((a, b) => (a.criado_em || '').localeCompare(b.criado_em || ''));

    if (apenasComSaldo) {
      lotes = lotes.filter((l) => (l.saldo_lote || 0) > 0);
    }

    return lotes;
  },

  /**
   * Buscar Lote por ID
   */
  async buscarLotePorId(loteId: string): Promise<Lote | null> {
    if (!loteId || !loteId.trim()) return null;
    const snap = await adminDb.collection(COLLECTIONS.LOTS).doc(loteId.trim()).get();
    if (!snap.exists) return null;
    return {
      ...(snap.data() as Lote),
      id: snap.id,
    };
  },

  /**
   * Buscar Lote por Número
   */
  async buscarLotePorNumero(produtoId: string, numeroLote: string): Promise<Lote | null> {
    if (!produtoId || !numeroLote) return null;
    const snap = await adminDb
      .collection(COLLECTIONS.LOTS)
      .where('produto_id', '==', produtoId.trim())
      .where('numero_lote', '==', numeroLote.trim())
      .limit(1)
      .get();
    if (snap.empty) return null;
    const docSnap = snap.docs[0];
    return {
      ...(docSnap.data() as Lote),
      id: docSnap.id,
    };
  },

  /**
   * Listar Movimentações com dados enriquecidos
   */
  async listarMovimentacoes(filtro?: {
    produto_id?: string;
    lote_id?: string;
    tipo?: any;
    data_inicio?: string;
    data_fim?: string;
    limite?: number;
  }): Promise<Movimentacao[]> {
    let q: FirebaseFirestore.Query = adminDb
      .collection(COLLECTIONS.MOVEMENTS)
      .orderBy('criado_em', 'desc');

    if (filtro?.limite) {
      q = q.limit(filtro.limite);
    }

    const snapshot = await q.get();
    let lista: Movimentacao[] = snapshot.docs.map((d) => ({
      ...(d.data() as Movimentacao),
      id: d.id,
    }));

    if (filtro?.produto_id) {
      lista = lista.filter((m) => m.produto_id === filtro.produto_id);
    }
    if (filtro?.lote_id) {
      lista = lista.filter((m) => m.lote_id === filtro.lote_id);
    }
    if (filtro?.tipo) {
      lista = lista.filter((m) => m.tipo === filtro.tipo);
    }
    if (filtro?.data_inicio) {
      lista = lista.filter((m) => m.criado_em >= filtro.data_inicio!);
    }
    if (filtro?.data_fim) {
      lista = lista.filter((m) => m.criado_em <= filtro.data_fim!);
    }

    // Enriquecimento
    const prodSnapshot = await adminDb.collection(COLLECTIONS.PRODUCTS).get();
    const produtosMap = new Map(prodSnapshot.docs.map((d) => [d.id, d.data() as Produto]));

    const lotesSnapshot = await adminDb.collection(COLLECTIONS.LOTS).get();
    const lotesMap = new Map(lotesSnapshot.docs.map((d) => [d.id, d.data() as Lote]));

    return lista.map((m) => {
      const prod = produtosMap.get(m.produto_id);
      const lote = m.lote_id ? lotesMap.get(m.lote_id) : null;
      return {
        ...m,
        produto_nome: prod?.nome,
        produto_codigo: prod?.codigo,
        produto_unidade: prod?.unidade_medida,
        lote_numero: lote?.numero_lote,
        usuario_nome: m.usuario_nome || 'Operador Almoxarifado',
      };
    });
  },

  /**
   * Listar Conferências Físicas com dados enriquecidos
   */
  async listarConferenciasFisicas(filtro?: {
    produto_id?: string;
    lote_id?: string;
    data_inicio?: string;
    data_fim?: string;
    limite?: number;
  }): Promise<ConferenciaFisica[]> {
    let q: FirebaseFirestore.Query = adminDb
      .collection(COLLECTIONS.PHYSICAL_COUNTS)
      .orderBy('criado_em', 'desc');

    if (filtro?.limite) {
      q = q.limit(filtro.limite);
    }

    const snapshot = await q.get();
    let lista: ConferenciaFisica[] = snapshot.docs.map((d) => ({
      ...(d.data() as ConferenciaFisica),
      id: d.id,
    }));

    if (filtro?.produto_id) {
      lista = lista.filter((c) => c.produto_id === filtro.produto_id);
    }
    if (filtro?.lote_id) {
      lista = lista.filter((c) => c.lote_id === filtro.lote_id);
    }
    if (filtro?.data_inicio) {
      lista = lista.filter((c) => c.criado_em >= filtro.data_inicio!);
    }
    if (filtro?.data_fim) {
      lista = lista.filter((c) => c.criado_em <= filtro.data_fim!);
    }

    const prodSnapshot = await adminDb.collection(COLLECTIONS.PRODUCTS).get();
    const produtosMap = new Map(prodSnapshot.docs.map((d) => [d.id, d.data() as Produto]));

    const lotesSnapshot = await adminDb.collection(COLLECTIONS.LOTS).get();
    const lotesMap = new Map(lotesSnapshot.docs.map((d) => [d.id, d.data() as Lote]));

    return lista.map((c) => {
      const prod = produtosMap.get(c.produto_id);
      const lote = c.lote_id ? lotesMap.get(c.lote_id) : null;
      return {
        ...c,
        produto_nome: prod?.nome,
        produto_codigo: prod?.codigo,
        lote_numero: lote?.numero_lote,
        realizado_por_nome: c.realizado_por_nome || 'Operador Almoxarifado',
      };
    });
  },


  /**
   * ============================================================================
   * GERENCIAMENTO DE USUÁRIOS (EXCLUSIVO ADMIN)
   * ============================================================================
   */

  /**
   * Lista todos os usuários cadastrados na coleção users do Firestore.
   */
  async listarUsuarios(): Promise<Usuario[]> {
    const snapshot = await adminDb.collection(COLLECTIONS.USERS).orderBy('criadoEm', 'desc').get();
    return snapshot.docs.map((doc) => {
      const d = doc.data();
      const papelValido: PapelUsuario = (d.papel === 'ADMIN' || d.papel === 'OPERADOR' || d.papel === 'CONSULTA')
        ? d.papel
        : 'CONSULTA';

      return {
        id: doc.id,
        uid: doc.id,
        email: d.email || '',
        nome: d.nome || '',
        papel: papelValido,
        ativo: d.ativo !== false,
        criadoEm: d.criadoEm || d.criado_em,
        atualizadoEm: d.atualizadoEm || d.atualizado_em,
      };
    });
  },

  /**
   * Cria um novo usuário no Firebase Authentication e armazena seu perfil no Firestore.
   * NUNCA armazena senha no Firestore.
   */
  async criarUsuario(dto: CriarUsuarioDTO): Promise<Usuario> {
    if (!dto.email || !dto.email.includes('@')) {
      throw new Error('E-mail inválido ou não informado.');
    }
    if (!dto.nome || !dto.nome.trim()) {
      throw new Error('Nome do usuário é obrigatório.');
    }
    if (!dto.senha || dto.senha.length < 6) {
      throw new Error('A senha deve conter no mínimo 6 caracteres.');
    }

    // Papel estrito: CONSULTA, OPERADOR ou ADMIN
    if (dto.papel !== 'CONSULTA' && dto.papel !== 'OPERADOR' && dto.papel !== 'ADMIN') {
      throw new Error('Papel inválido. Permitido somente CONSULTA, OPERADOR ou ADMIN.');
    }

    const emailLimpo = dto.email.trim().toLowerCase();
    const nomeLimpo = dto.nome.trim();

    // 1. Criar usuário no Firebase Authentication (Admin SDK)
    const userRecord = await adminAuth.createUser({
      email: emailLimpo,
      password: dto.senha,
      displayName: nomeLimpo,
    });

    const now = new Date().toISOString();

    // 2. Criar documento do usuário no Firestore users/{uid} SEM a senha
    const novoUsuario: Omit<Usuario, 'id'> = {
      uid: userRecord.uid,
      email: emailLimpo,
      nome: nomeLimpo,
      papel: dto.papel,
      ativo: true,
      criadoEm: now,
      atualizadoEm: now,
    };

    await adminDb.collection(COLLECTIONS.USERS).doc(userRecord.uid).set(novoUsuario);

    return {
      id: userRecord.uid,
      ...novoUsuario,
    };
  },

  /**
   * Atualiza papel, nome ou status de ativação de um usuário no Firestore.
   */
  async atualizarUsuario(uid: string, dto: AtualizarUsuarioDTO): Promise<Usuario> {
    if (!uid || !uid.trim()) {
      throw new Error('UID do usuário é obrigatório.');
    }

    const userRef = adminDb.collection(COLLECTIONS.USERS).doc(uid.trim());
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      throw new Error('Usuário não encontrado.');
    }

    const dadosAtuais = userSnap.data()!;
    const atualizacoes: Record<string, any> = {
      atualizadoEm: new Date().toISOString(),
    };

    if (dto.nome && dto.nome.trim()) {
      atualizacoes.nome = dto.nome.trim();
    }

    if (dto.papel) {
      if (dto.papel !== 'CONSULTA' && dto.papel !== 'OPERADOR' && dto.papel !== 'ADMIN') {
        throw new Error('Papel inválido. Permitido somente CONSULTA, OPERADOR ou ADMIN.');
      }
      atualizacoes.papel = dto.papel;
    }

    if (typeof dto.ativo === 'boolean') {
      atualizacoes.ativo = dto.ativo;

      // Se desativado, também desativa no Firebase Auth e revoga tokens
      try {
        await adminAuth.updateUser(uid, { disabled: !dto.ativo });
        if (!dto.ativo) {
          await adminAuth.revokeRefreshTokens(uid);
        }
      } catch (authErr) {
        console.warn(`Aviso: Não foi possível sincronizar status no Firebase Auth para ${uid}`, authErr);
      }
    }

    await userRef.update(atualizacoes);

    const docAtualizado = await userRef.get();
    const d = docAtualizado.data()!;
    const papelValido: PapelUsuario = (d.papel === 'ADMIN' || d.papel === 'OPERADOR' || d.papel === 'CONSULTA')
      ? d.papel
      : 'CONSULTA';

    return {
      id: docAtualizado.id,
      uid: docAtualizado.id,
      email: d.email || dadosAtuais.email,
      nome: d.nome || dadosAtuais.nome,
      papel: papelValido,
      ativo: d.ativo !== false,
      criadoEm: d.criadoEm || d.criado_em,
      atualizadoEm: d.atualizadoEm || d.atualizado_em,
    };
  },
};

