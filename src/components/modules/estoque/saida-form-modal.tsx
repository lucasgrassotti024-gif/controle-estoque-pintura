'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Produto, RegistrarSaidaDTO, ResultadoOperacaoEstoque, Lote } from '@/types/stock';
import { stockService } from '@/services/stock-service';
import { lotService } from '@/services/lot-service';
import { formatarQuantidade, formatarDataSimples } from '@/lib/utils/formatters';
import { formatarErroBanco } from '@/lib/utils/error-handler';
import { 
  ArrowUpRight, 
  X, 
  Layers, 
  AlertCircle, 
  CheckCircle2, 
  ChevronRight,
  Target,
  Clock,
  AlertTriangle
} from 'lucide-react';

interface SaidaFormModalProps {
  produtoInicial?: Produto | null;
  produtosDisponiveis: Produto[];
  aoSalvarSucesso: (resultado: ResultadoOperacaoEstoque, produtoId: string) => void;
  aoFechar: () => void;
}

export function SaidaFormModal({
  produtoInicial,
  produtosDisponiveis,
  aoSalvarSucesso,
  aoFechar,
}: SaidaFormModalProps) {
  // Lista filtrada apenas com produtos ativos
  const produtosAtivos = useMemo(() => {
    return produtosDisponiveis.filter((p) => p.ativo);
  }, [produtosDisponiveis]);

  // Estado do Produto Selecionado
  const [produtoId, setProdutoId] = useState<string>(
    produtoInicial?.id || (produtosAtivos.length > 0 ? produtosAtivos[0].id : '')
  );

  const produtoSelecionado = useMemo(() => {
    return produtosAtivos.find((p) => p.id === produtoId) || null;
  }, [produtosAtivos, produtoId]);

  // Lotes disponíveis do produto selecionado
  const [lotesDisponiveis, setLotesDisponiveis] = useState<Lote[]>([]);
  const [carregandoLotes, setCarregandoLotes] = useState(false);
  
  // Seleção MANUAL de lote (NÃO seleciona nada automaticamente — sem FIFO/FEFO)
  const [loteIdSelecionado, setLoteIdSelecionado] = useState<string>('');

  const loteSelecionado = useMemo(() => {
    if (!loteIdSelecionado) return null;
    return lotesDisponiveis.find((l) => l.id === loteIdSelecionado) || null;
  }, [lotesDisponiveis, loteIdSelecionado]);

  // Estados dos Campos de Saída
  const [quantidade, setQuantidade] = useState<number | ''>('');
  const [documentoRef, setDocumentoRef] = useState('');
  const [motivoDestino, setMotivoDestino] = useState('');
  const [observacao, setObservacao] = useState('');

  // Estados de Controle de Envio
  const [etapaConfirmacao, setEtapaConfirmacao] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Carrega lotes do produto selecionado
  useEffect(() => {
    // Reset da seleção de lote ao trocar de produto
    setLoteIdSelecionado('');
    setErro(null);

    if (!produtoSelecionado || !produtoSelecionado.controla_lote) {
      setLotesDisponiveis([]);
      return;
    }

    async function buscarLotes() {
      setCarregandoLotes(true);
      try {
        const dados = await lotService.listarPorProduto(produtoSelecionado!.id, true);
        // Filtra lotes com saldo positivo para saída operacional
        const lotesComSaldo = dados.filter((l) => l.saldo_lote > 0);
        setLotesDisponiveis(lotesComSaldo);
      } catch (err) {
        console.error('Falha ao buscar lotes:', err);
        setLotesDisponiveis([]);
      } finally {
        setCarregandoLotes(false);
      }
    }

    buscarLotes();
  }, [produtoSelecionado]);

  // Limite de saldo disponível para a saída (informativo para a UI)
  const saldoDisponivelMaximo = useMemo(() => {
    if (!produtoSelecionado) return 0;
    if (produtoSelecionado.controla_lote) {
      return loteSelecionado ? loteSelecionado.saldo_lote : 0;
    }
    return produtoSelecionado.saldo_atual;
  }, [produtoSelecionado, loteSelecionado]);

  // Validação prévia de quantidade informada
  const avisoSaldoInsuficiente = useMemo(() => {
    if (typeof quantidade !== 'number' || quantidade <= 0) return null;
    if (produtoSelecionado?.controla_lote && loteSelecionado) {
      if (quantidade > loteSelecionado.saldo_lote) {
        return `Quantidade solicitada (${formatarQuantidade(quantidade)}) é superior ao saldo do lote (${formatarQuantidade(loteSelecionado.saldo_lote)}).`;
      }
    } else if (produtoSelecionado && !produtoSelecionado.controla_lote) {
      if (quantidade > produtoSelecionado.saldo_atual) {
        return `Quantidade solicitada (${formatarQuantidade(quantidade)}) é superior ao saldo do estoque (${formatarQuantidade(produtoSelecionado.saldo_atual)}).`;
      }
    }
    return null;
  }, [quantidade, produtoSelecionado, loteSelecionado]);

  // Avança para a tela de confirmação
  function handleAvancarParaConfirmacao(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (!produtoSelecionado) {
      setErro('Selecione um produto ativo para realizar a saída.');
      return;
    }

    if (!produtoSelecionado.ativo) {
      setErro('Operação bloqueada: produto inativo não pode receber saídas de estoque.');
      return;
    }

    if (typeof quantidade !== 'number' || isNaN(quantidade) || quantidade <= 0) {
      setErro('Informe uma quantidade válida maior que zero.');
      return;
    }

    if (produtoSelecionado.controla_lote) {
      if (!loteIdSelecionado) {
        setErro('Lote obrigatório: este produto controla lote. Selecione manualmente o lote de origem.');
        return;
      }
      if (!loteSelecionado) {
        setErro('Lote selecionado inválido ou não encontrado.');
        return;
      }
      if (quantidade > loteSelecionado.saldo_lote) {
        setErro(`Saldo insuficiente no lote selecionado. Disponível: ${formatarQuantidade(loteSelecionado.saldo_lote)} ${produtoSelecionado.unidade_medida}.`);
        return;
      }
    } else {
      if (quantidade > produtoSelecionado.saldo_atual) {
        setErro(`Saldo insuficiente no produto. Saldo disponível: ${formatarQuantidade(produtoSelecionado.saldo_atual)} ${produtoSelecionado.unidade_medida}.`);
        return;
      }
    }

    setEtapaConfirmacao(true);
  }

  // Suporte a fechamento por tecla Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !processando) {
        aoFechar();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [aoFechar, processando]);

  // Executa o envio oficial para a RPC registrar_saida
  async function handleConfirmarSaida() {
    if (!produtoSelecionado) return;
    if (processando) return; // Proteção contra duplo clique

    setProcessando(true);
    setErro(null);

    try {
      const dto: RegistrarSaidaDTO = {
        produto_id: produtoSelecionado.id,
        quantidade: Number(quantidade),
        documento_ref: documentoRef.trim() || null,
        motivo_destino: motivoDestino.trim() || null,
        observacao: observacao.trim() || null,
        lote_id: produtoSelecionado.controla_lote ? loteIdSelecionado : null,
      };

      // Executa chamada estritamente tipada ao service (sem mutação no frontend)
      const resultado = await stockService.darSaida(dto, produtoSelecionado);

      // Sucesso: notifica o componente pai para re-consultar o estoque no banco
      aoSalvarSucesso(resultado, produtoSelecionado.id);
    } catch (err: any) {
      console.error('Erro ao registrar saída de estoque:', err);
      const erroTratado = formatarErroBanco(err);
      setErro(erroTratado.mensagem);
      setEtapaConfirmacao(false);
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded bg-amber-950/60 border border-amber-800/60 text-amber-400">
              <ArrowUpRight className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                Registrar Saída de Estoque
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                  Baixa Operacional
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                {etapaConfirmacao
                  ? 'Revise os dados antes de confirmar a baixa no inventário'
                  : 'Preencha a quantidade e destino da retirada de material'}
              </p>
            </div>
          </div>
          <button
            onClick={aoFechar}
            disabled={processando}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 rounded-md hover:bg-zinc-800 transition-colors disabled:opacity-50"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {erro && (
            <div className="p-3.5 bg-rose-950/50 border border-rose-800/80 rounded-md flex items-start gap-2 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <div>
                <span className="font-semibold">Atenção:</span> {erro}
              </div>
            </div>
          )}

          {!etapaConfirmacao ? (
            /* ETAPA 1: PREENCHIMENTO DOS DADOS */
            <form id="form-saida" onSubmit={handleAvancarParaConfirmacao} className="space-y-4">
              {/* Seleção do Produto */}
              <div>
                <label className="block text-xs font-mono uppercase text-zinc-400 mb-1.5">
                  Material / Produto <span className="text-amber-500">*</span>
                </label>
                <select
                  value={produtoId}
                  onChange={(e) => setProdutoId(e.target.value)}
                  disabled={!!produtoInicial}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-amber-500 transition-colors disabled:opacity-75 disabled:bg-zinc-900"
                  required
                >
                  {produtosAtivos.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.codigo}] {p.nome} — Saldo: {formatarQuantidade(p.saldo_atual)} {p.unidade_medida} {p.controla_lote ? '(Controla Lote)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Informações Resumidas do Produto Selecionado */}
              {produtoSelecionado && (
                <div className="p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-md grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-zinc-500 font-mono block text-[10px] uppercase">Código:</span>
                    <span className="font-mono text-zinc-200 font-semibold">{produtoSelecionado.codigo}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 font-mono block text-[10px] uppercase">Unidade:</span>
                    <span className="font-mono text-zinc-200">{produtoSelecionado.unidade_medida}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 font-mono block text-[10px] uppercase">Saldo Atual:</span>
                    <span className={`font-mono font-bold ${produtoSelecionado.saldo_atual <= 0 ? 'text-rose-400' : 'text-zinc-100'}`}>
                      {formatarQuantidade(produtoSelecionado.saldo_atual)} {produtoSelecionado.unidade_medida}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 font-mono block text-[10px] uppercase">Rastreabilidade:</span>
                    <span className={`font-mono text-[11px] ${produtoSelecionado.controla_lote ? 'text-amber-400' : 'text-zinc-400'}`}>
                      {produtoSelecionado.controla_lote ? 'Exige Lote' : 'Sem Lote'}
                    </span>
                  </div>
                </div>
              )}

              {/* SELEÇÃO DE LOTE (SE CONTROLA_LOTE = TRUE) */}
              {produtoSelecionado?.controla_lote && (
                <div className="p-4 bg-zinc-950/80 border border-amber-900/40 rounded-md space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-amber-500" />
                      <label className="text-xs font-mono uppercase text-amber-400 font-semibold">
                        Lote de Origem (Seleção Manual Obrigatória) <span className="text-amber-500">*</span>
                      </label>
                    </div>
                    {carregandoLotes && (
                      <span className="text-[11px] text-zinc-500 font-mono animate-pulse">Carregando lotes...</span>
                    )}
                  </div>

                  {lotesDisponiveis.length === 0 && !carregandoLotes ? (
                    <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded text-xs text-amber-300 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        Nenhum lote com saldo positivo foi localizado para este material. Não é possível registrar saída sem lote com saldo disponível.
                      </div>
                    </div>
                  ) : (
                    <div>
                      <select
                        value={loteIdSelecionado}
                        onChange={(e) => setLoteIdSelecionado(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-amber-500 transition-colors"
                        required
                      >
                        <option value="">-- Selecione o lote de onde sairá o material --</option>
                        {lotesDisponiveis.map((l) => (
                          <option key={l.id} value={l.id}>
                            Lote: {l.numero_lote} | Saldo: {formatarQuantidade(l.saldo_lote)} {produtoSelecionado.unidade_medida}
                            {l.data_validade ? ` | Val: ${formatarDataSimples(l.data_validade)}` : ''}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-zinc-500 mt-1">
                        O operador deve escolher manualmente o lote físico utilizado. O sistema não assume baixa automática (sem FIFO/FEFO).
                      </p>
                    </div>
                  )}

                  {/* Detalhe do lote selecionado */}
                  {loteSelecionado && (
                    <div className="p-2.5 bg-zinc-900 border border-zinc-800 rounded flex items-center justify-between text-xs font-mono">
                      <div className="text-zinc-400">
                        Saldo no Lote <span className="text-amber-400 font-bold">{loteSelecionado.numero_lote}</span>:
                      </div>
                      <div className="text-zinc-200 font-bold">
                        {formatarQuantidade(loteSelecionado.saldo_lote)} {produtoSelecionado.unidade_medida}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Quantidade a Retirar */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-mono uppercase text-zinc-400">
                    Quantidade de Saída ({produtoSelecionado?.unidade_medida}) <span className="text-amber-500">*</span>
                  </label>
                  {produtoSelecionado && (
                    <span className="text-[11px] font-mono text-zinc-500">
                      Disponível:{' '}
                      <strong className="text-zinc-300">
                        {formatarQuantidade(saldoDisponivelMaximo)} {produtoSelecionado.unidade_medida}
                      </strong>
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  max={saldoDisponivelMaximo > 0 ? saldoDisponivelMaximo : undefined}
                  value={quantidade}
                  onChange={(e) => {
                    const val = e.target.value;
                    setQuantidade(val === '' ? '' : parseFloat(val));
                  }}
                  placeholder="Ex: 5 ou 2.500"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-amber-500 transition-colors font-mono"
                  required
                />
                {avisoSaldoInsuficiente && (
                  <p className="text-xs text-rose-400 font-medium mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {avisoSaldoInsuficiente}
                  </p>
                )}
              </div>

              {/* Motivo / Destino e Documento */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase text-zinc-400 mb-1.5">
                    Destino / Aplicação
                  </label>
                  <input
                    type="text"
                    value={motivoDestino}
                    onChange={(e) => setMotivoDestino(e.target.value)}
                    placeholder="Ex: OP #104, Linha 2, Manutenção"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-zinc-400 mb-1.5">
                    Documento de Referência
                  </label>
                  <input
                    type="text"
                    value={documentoRef}
                    onChange={(e) => setDocumentoRef(e.target.value)}
                    placeholder="Ex: Req. 4410, OS 881"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
              </div>

              {/* Observações */}
              <div>
                <label className="block text-xs font-mono uppercase text-zinc-400 mb-1.5">
                  Observações
                </label>
                <textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  rows={2}
                  placeholder="Informações adicionais para auditoria da saída..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-amber-500 transition-colors resize-none"
                />
              </div>
            </form>
          ) : (
            /* ETAPA 2: CONFIRMAÇÃO EXPLÍCITA */
            <div className="space-y-4">
              <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg space-y-3">
                <div className="flex items-center gap-2 text-xs font-mono uppercase text-amber-500 font-semibold border-b border-zinc-800 pb-2">
                  <Target className="w-4 h-4" />
                  Resumo da Operação de Saída
                </div>

                {/* Declaração Explícita de Saída */}
                <div className="p-3 bg-amber-950/40 border border-amber-800/80 rounded-md text-amber-200 text-xs font-semibold leading-relaxed">
                  ESTOU REGISTRANDO UMA BAIXA OPERACIONAL DE{' '}
                  <span className="text-amber-400 font-bold underline">
                    {formatarQuantidade(Number(quantidade))} {produtoSelecionado?.unidade_medida}
                  </span>{' '}
                  DO MATERIAL &ldquo;{produtoSelecionado?.nome}&rdquo;
                  {motivoDestino ? ` COM DESTINO A: "${motivoDestino.toUpperCase()}"` : ''}.
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-zinc-500 font-mono block text-[10px] uppercase">Material:</span>
                    <span className="font-semibold text-zinc-100">{produtoSelecionado?.nome}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 font-mono block text-[10px] uppercase">Código:</span>
                    <span className="font-mono text-zinc-300">{produtoSelecionado?.codigo}</span>
                  </div>

                  <div>
                    <span className="text-zinc-500 font-mono block text-[10px] uppercase">Quantidade de Baixa:</span>
                    <span className="font-mono font-bold text-amber-400 text-sm">
                      - {formatarQuantidade(Number(quantidade))} {produtoSelecionado?.unidade_medida}
                    </span>
                  </div>

                  <div>
                    <span className="text-zinc-500 font-mono block text-[10px] uppercase">Lote Baixado:</span>
                    <span className="font-mono font-semibold text-zinc-200">
                      {produtoSelecionado?.controla_lote
                        ? loteSelecionado?.numero_lote || 'Não informado'
                        : 'Não aplicável (sem lote)'}
                    </span>
                  </div>

                  {motivoDestino && (
                    <div className="col-span-2">
                      <span className="text-zinc-500 font-mono block text-[10px] uppercase">Destino / Aplicação:</span>
                      <span className="text-zinc-200">{motivoDestino}</span>
                    </div>
                  )}

                  {documentoRef && (
                    <div>
                      <span className="text-zinc-500 font-mono block text-[10px] uppercase">Documento:</span>
                      <span className="text-zinc-300 font-mono">{documentoRef}</span>
                    </div>
                  )}

                  {observacao && (
                    <div className="col-span-2">
                      <span className="text-zinc-500 font-mono block text-[10px] uppercase">Observação:</span>
                      <span className="text-zinc-400 italic">{observacao}</span>
                    </div>
                  )}
                </div>

                {/* Prévia meramente informativa da posição estimada */}
                <div className="mt-3 pt-3 border-t border-zinc-800/80 grid grid-cols-2 gap-3 text-xs bg-zinc-900/50 p-2.5 rounded">
                  <div>
                    <span className="text-zinc-500 text-[10px] font-mono block uppercase">Saldo Produto Atual:</span>
                    <span className="font-mono text-zinc-300">
                      {formatarQuantidade(produtoSelecionado?.saldo_atual || 0)} {produtoSelecionado?.unidade_medida}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px] font-mono block uppercase">Estimativa Pós-Saída:</span>
                    <span className="font-mono font-bold text-amber-400">
                      {formatarQuantidade(Math.max(0, (produtoSelecionado?.saldo_atual || 0) - Number(quantidade)))}{' '}
                      {produtoSelecionado?.unidade_medida}
                    </span>
                  </div>
                  {produtoSelecionado?.controla_lote && loteSelecionado && (
                    <div className="col-span-2 border-t border-zinc-800/50 pt-2 flex justify-between text-zinc-400 text-[11px] font-mono">
                      <span>Estimativa Lote ({loteSelecionado.numero_lote}):</span>
                      <span className="text-zinc-200 font-bold">
                        {formatarQuantidade(Math.max(0, loteSelecionado.saldo_lote - Number(quantidade)))}{' '}
                        {produtoSelecionado?.unidade_medida}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-md text-xs text-zinc-400 flex items-start gap-2">
                <Clock className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                <div>
                  A operação será gravada de forma atômica no banco de dados e lançada no histórico com seu usuário autenticado.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé com Botões de Ação */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 bg-zinc-950/50">
          {!etapaConfirmacao ? (
            <>
              <button
                type="button"
                onClick={aoFechar}
                className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="form-saida"
                disabled={
                  (produtoSelecionado?.controla_lote && lotesDisponiveis.length === 0) ||
                  Boolean(avisoSaldoInsuficiente) ||
                  quantidade === '' ||
                  Number(quantidade) <= 0
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-amber-600 hover:bg-amber-500 text-zinc-950 text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-xs cursor-pointer"
              >
                <span>Avançar para Confirmação</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEtapaConfirmacao(false)}
                disabled={processando}
                className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Voltar e Editar
              </button>
              <button
                type="button"
                onClick={handleConfirmarSaida}
                disabled={processando}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md cursor-pointer"
              >
                {processando ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                    <span>Processando Baixa...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirmar Saída Definitiva</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
