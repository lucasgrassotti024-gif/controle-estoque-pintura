/**
 * Mapeamento e normalização padronizada de erros gerados pelo PostgreSQL/Supabase.
 * Transforma exceções de triggers, RPCs e constraints em mensagens amigáveis e estruturadas.
 */

export interface ErroFormatado {
  codigo: string;
  mensagem: string;
  detalhe?: string;
}

export function formatarErroBanco(erro: unknown): ErroFormatado {
  if (!erro) {
    return { codigo: 'ERRO_DESCONHECIDO', mensagem: 'Ocorreu um erro desconhecido.' };
  }

  const errObj = erro as { message?: string; details?: string; hint?: string; code?: string };
  const rawMsg = errObj.message || String(erro);
  const rawDetails = errObj.details || errObj.hint;

  // 1. Saldo Insuficiente no Lote (deve vir antes da checagem geral de saldo)
  if (rawMsg.includes('Saldo insuficiente no lote')) {
    return {
      codigo: 'SALDO_LOTE_INSUFICIENTE',
      mensagem: rawMsg,
      detalhe: rawDetails
    };
  }

  // 2. Saldo Insuficiente no Produto / Geral
  if (rawMsg.includes('Saldo insuficiente no produto') || rawMsg.includes('Saldo insuficiente')) {
    return {
      codigo: 'SALDO_INSUFICIENTE',
      mensagem: rawMsg,
      detalhe: rawDetails
    };
  }

  // 3. Lote Obrigatório
  if (rawMsg.includes('Lote obrigatório')) {
    return {
      codigo: 'LOTE_OBRIGATORIO',
      mensagem: rawMsg,
      detalhe: rawDetails
    };
  }

  // 4. Lote Inválido ou Não Pertence ao Produto
  if (rawMsg.includes('o lote informado não pertence a este produto') || rawMsg.includes('Lote não encontrado')) {
    return {
      codigo: 'LOTE_INVALIDO',
      mensagem: rawMsg,
      detalhe: rawDetails
    };
  }

  // 5. Quantidade Inválida
  if (rawMsg.includes('deve ser maior que zero') || rawMsg.includes('não pode ser negativa')) {
    return {
      codigo: 'QUANTIDADE_INVALIDA',
      mensagem: rawMsg,
      detalhe: rawDetails
    };
  }

  // 6. Justificativa Obrigatória
  if (rawMsg.includes('Justificativa obrigatória')) {
    return {
      codigo: 'JUSTIFICATIVA_OBRIGATORIA',
      mensagem: rawMsg,
      detalhe: rawDetails
    };
  }

  // 7. Tentativa de Alteração Direta de Saldo
  if (rawMsg.includes('A coluna saldo_atual não pode ser alterada diretamente')) {
    return {
      codigo: 'ALTERACAO_SALDO_BLOQUEADA',
      mensagem: 'Operação proibida: o saldo de estoque só pode ser alterado por movimentação ou conferência.',
      detalhe: rawDetails
    };
  }

  // 8. Tentativa de Mutação de Histórico (Append-Only)
  if (rawMsg.includes('registros históricos são estritamente imutáveis')) {
    return {
      codigo: 'HISTORICO_IMUTAVEL',
      mensagem: 'Operação proibida: o histórico de estoque não pode ser alterado ou excluído.',
      detalhe: rawDetails
    };
  }

  // 9. Usuário Não Autenticado
  if (rawMsg.includes('usuário não autenticado')) {
    return {
      codigo: 'NAO_AUTENTICADO',
      mensagem: 'Você precisa estar autenticado para realizar esta operação de estoque.',
      detalhe: rawDetails
    };
  }

  // 10. Acesso Negado por Papel (ex: CONSULTA tentando movimentar estoque)
  if (rawMsg.includes('Acesso negado: perfil de apenas CONSULTA')) {
    return {
      codigo: 'ACESSO_NEGADO_PAPEL',
      mensagem: 'Acesso negado: seu perfil (CONSULTA) possui apenas permissão de visualização e não pode realizar movimentações.',
      detalhe: rawDetails
    };
  }

  // 11. Usuário Inativo
  if (rawMsg.includes('usuário inativo ou não cadastrado')) {
    return {
      codigo: 'USUARIO_INATIVO',
      mensagem: 'Operação bloqueada: seu usuário encontra-se inativo no sistema.',
      detalhe: rawDetails
    };
  }

  // 12. Produto Não Encontrado ou Inativo
  if (rawMsg.includes('Produto não encontrado ou inativo')) {
    return {
      codigo: 'PRODUTO_NAO_ENCONTRADO',
      mensagem: rawMsg,
      detalhe: rawDetails
    };
  }

  // 11. Código de Produto Duplicado (Unique Constraint)
  if (rawMsg.includes('produtos_codigo_key') || rawMsg.includes('duplicate key value violates unique constraint')) {
    return {
      codigo: 'CODIGO_DUPLICADO',
      mensagem: 'Já existe um material cadastrado com este código.',
      detalhe: rawDetails
    };
  }

  // 12. Categoria ou Unidade Inválida (Check Constraint)
  if (rawMsg.includes('chk_produtos_categoria')) {
    return {
      codigo: 'CATEGORIA_INVALIDA',
      mensagem: 'Categoria inválida. Selecione uma categoria permitida pela V1.',
      detalhe: rawDetails
    };
  }
  if (rawMsg.includes('chk_produtos_unidade_medida')) {
    return {
      codigo: 'UNIDADE_INVALIDA',
      mensagem: 'Unidade de medida inválida. Selecione uma unidade permitida pela V1.',
      detalhe: rawDetails
    };
  }

  // Erro Geral / Inesperado (preserva a mensagem para não ocultar causas em dev)
  return {
    codigo: 'ERRO_BANCO',
    mensagem: rawMsg,
    detalhe: rawDetails
  };
}
