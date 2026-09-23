import { adminDb, DocumentReference, Transaction } from '@/server/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/firestore';
import { 
  RegistrarEntradaDTO, 
  RegistrarSaidaDTO, 
  RegistrarConferenciaDTO,
  ResultadoOperacaoEstoque,
  CriarProdutoDTO,
  AtualizarProdutoDTO,
  Produto,
  Lote
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

// Identificador técnico temporário de desenvolvimento (documentado conforme diretriz da Fase 17)
const USUARIO_TECNICO_DEV = 'usr-dev-master';

export const stockServerService = {
  /**
   * Registra Entrada de Estoque de forma atômica no servidor.
   */
  async registrarEntrada(dto: RegistrarEntradaDTO): Promise<ResultadoOperacaoEstoque> {
    if (!dto.produto_id) {
      throw new Error('ID do produto é obrigatório.');
    }
    if (typeof dto.quantidade !== 'number' || dto.quantidade <= 0) {
      throw new Error('A quantidade de entrada deve ser maior que zero.');
    }

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

      // 6. Registro no Ledger Imutável
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
        usuario_id: USUARIO_TECNICO_DEV,
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
   */
  async registrarSaida(dto: RegistrarSaidaDTO): Promise<ResultadoOperacaoEstoque> {
    if (!dto.produto_id) {
      throw new Error('ID do produto é obrigatório.');
    }
    if (typeof dto.quantidade !== 'number' || dto.quantidade <= 0) {
      throw new Error('A quantidade de saída deve ser maior que zero.');
    }

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
        usuario_id: USUARIO_TECNICO_DEV,
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
   */
  async registrarConferenciaFisica(dto: RegistrarConferenciaDTO): Promise<ResultadoOperacaoEstoque> {
    if (!dto.produto_id) {
      throw new Error('ID do produto é obrigatório.');
    }
    if (typeof dto.quantidade_encontrada !== 'number' || dto.quantidade_encontrada < 0) {
      throw new Error('A quantidade encontrada na conferência física não pode ser negativa.');
    }

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

      // 5. Registrar na coleção de Conferências Físicas
      const confRef = adminDb.collection(COLLECTIONS.PHYSICAL_COUNTS).doc();
      transaction.set(confRef, {
        produto_id: dto.produto_id,
        lote_id: dto.lote_id || null,
        quantidade_anterior: produto.controla_lote ? saldoAntLote : saldoAntProd,
        quantidade_encontrada: dto.quantidade_encontrada,
        diferenca: diferenca,
        justificativa: dto.justificativa?.trim() || null,
        observacao: dto.observacao?.trim() || null,
        realizado_por: USUARIO_TECNICO_DEV,
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
          usuario_id: USUARIO_TECNICO_DEV,
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
};
