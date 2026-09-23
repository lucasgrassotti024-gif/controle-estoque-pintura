'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Produto, RegistrarEntradaDTO, ResultadoOperacaoEstoque, Lote } from '@/types/stock';
import { stockService } from '@/services/stock-service';
import { lotService } from '@/services/lot-service';
import { formatarQuantidade } from '@/lib/utils/formatters';
import { formatarErroBanco } from '@/lib/utils/error-handler';
import { 
  ArrowDownLeft, 
  X, 
  Layers, 
  Calendar, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  ChevronRight,
  HelpCircle
} from 'lucide-react';

interface EntradaFormModalProps {
  produtoInicial?: Produto | null;
  produtosDisponiveis: Produto[];
  aoSalvarSucesso: (resultado: ResultadoOperacaoEstoque, produtoId: string) => void;
  aoFechar: () => void;
}

export function EntradaFormModal({
  produtoInicial,
  produtosDisponiveis,
  aoSalvarSucesso,
  aoFechar,
}: EntradaFormModalProps) {
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

  // Lotes existentes do produto selecionado
  const [lotesExistentes, setLotesExistentes] = useState<Lote[]>([]);
  const [carregandoLotes, setCarregandoLotes] = useState(false);
  const [modoLote, setModoLote] = useState<'EXISTENTE' | 'NOVO'>('NOVO');

  // Estados dos Campos de Entrada
  const [quantidade, setQuantidade] = useState<number | ''>('');
  const [numeroLote, setNumeroLote] = useState('');
  const [dataValidade, setDataValidade] = useState('');
  const [documentoRef, setDocumentoRef] = useState('');
  const [motivoDestino, setMotivoDestino] = useState('');
  const [observacao, setObservacao] = useState('');

  // Estados de Controle de Envio
  const [etapaConfirmacao, setEtapaConfirmacao] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Carrega lotes existentes quando o produto controlado é alterado
  useEffect(() => {
    if (!produtoSelecionado || !produtoSelecionado.controla_lote) {
      setLotesExistentes([]);
      setNumeroLote('');
      setDataValidade('');
      return;
    }

    async function buscarLotes() {
      setCarregandoLotes(true);
      try {
        const dados = await lotService.listarPorProduto(produtoSelecionado!.id);
        setLotesExistentes(dados);
        if (dados.length > 0) {
          setModoLote('EXISTENTE');
          setNumeroLote(dados[0].numero_lote);
          setDataValidade(dados[0].data_validade || '');
        } else {
          setModoLote('NOVO');
          setNumeroLote('');
          setDataValidade('');
        }
      } catch {
        setLotesExistentes([]);
      } finally {
        setCarregandoLotes(false);
      }
    }

    buscarLotes();
  }, [produtoSelecionado]);

  function handleSelecionarLoteExistente(numero: string) {
    setNumeroLote(numero);
    const lote = lotesExistentes.find((l) => l.numero_lote === numero);
    if (lote && lote.data_validade) {
      setDataValidade(lote.data_validade);
    }
  }

  function handleAvancarParaConfirmacao(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (!produtoSelecionado) {
      setErro('Selecione um produto ativo para registrar a entrada.');
      return;
    }
    if (typeof quantidade !== 'number' || quantidade <= 0) {
      setErro('A quantidade de entrada deve ser um número maior que zero.');
      return;
    }
    if (produtoSelecionado.controla_lote && !numeroLote.trim()) {
      setErro('Número do lote é obrigatório para materiais controlados por lote.');
      return;
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

  async function handleConfirmarEntrada() {
    if (!produtoSelecionado || typeof quantidade !== 'number') return;

    setProcessando(true);
    setErro(null);

    try {
      const dto: RegistrarEntradaDTO = {
        produto_id: produtoSelecionado.id,
        quantidade,
        documento_ref: documentoRef.trim() || null,
        motivo_destino: motivoDestino.trim() || null,
        observacao: observacao.trim() || null,
        numero_lote: produtoSelecionado.controla_lote ? numeroLote.trim() : null,
        data_validade: (produtoSelecionado.controla_lote && dataValidade) ? dataValidade : null,
      };

      // Despacha para o service (que orquestra para a RPC atômica com auth.uid())
      const resultado = await stockService.darEntrada(dto, produtoSelecionado);
      aoSalvarSucesso(resultado, produtoSelecionado.id);
    } catch (err: any) {
      const errTratado = formatarErroBanco(err);
      setErro(errTratado.mensagem);
      setEtapaConfirmacao(false); // Retorna ao formulário para ajustes
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget && !processando) aoFechar();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-950 border border-emerald-800/80 flex items-center justify-center text-emerald-400">
              <ArrowDownLeft className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100">
                Registrar Entrada de Estoque
              </h2>
              <p className="text-xs text-zinc-400">
                Recebimento de materiais e abastecimento auditado do estoque.
              </p>
            </div>
          </div>
          <button
            onClick={aoFechar}
            disabled={processando}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors disabled:opacity-50"
            aria-label="Fechar formulário de entrada"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
          {erro && (
            <div className="p-3 rounded-md bg-red-950/60 border border-red-900/80 text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{erro}</span>
            </div>
          )}

          {!etapaConfirmacao ? (
            /* ETAPA 1: PREENCHIMENTO DO FORMULÁRIO */
            <form id="form-entrada" onSubmit={handleAvancarParaConfirmacao} className="space-y-4">
              {/* Seleção do Produto */}
              <div>
                <label className="block text-zinc-400 font-mono uppercase text-[10px] mb-1 font-semibold">
                  Material / Produto (Apenas Ativos) *
                </label>
                <select
                  value={produtoId}
                  onChange={(e) => setProdutoId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-zinc-200 focus:outline-none focus:border-amber-500 font-medium text-sm"
                  required
                >
                  {produtosAtivos.length === 0 ? (
                    <option value="">Nenhum produto ativo disponível</option>
                  ) : (
                    produtosAtivos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.codigo} — {p.nome} ({p.unidade_medida})
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Card Resumo do Produto Selecionado */}
              {produtoSelecionado && (
                <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80 text-[11px] font-mono">
                  <div>
                    <span className="text-zinc-500 block text-[9px] uppercase">Saldo Atual</span>
                    <span className="font-bold text-zinc-200">
                      {formatarQuantidade(produtoSelecionado.saldo_atual, produtoSelecionado.unidade_medida)}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[9px] uppercase">Est. Mínimo</span>
                    <span className="text-zinc-300">
                      {formatarQuantidade(produtoSelecionado.estoque_minimo, produtoSelecionado.unidade_medida)}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[9px] uppercase">Controle de Lote</span>
                    <span className={produtoSelecionado.controla_lote ? 'text-amber-400 font-semibold' : 'text-zinc-500'}>
                      {produtoSelecionado.controla_lote ? 'Obrigatório' : 'Não se aplica'}
                    </span>
                  </div>
                </div>
              )}

              {/* Quantidade a Dar Entrada */}
              <div>
                <label className="block text-zinc-400 font-mono uppercase text-[10px] mb-1 font-semibold">
                  Quantidade Recebida ({produtoSelecionado?.unidade_medida || 'UN'}) *
                </label>
                <input
                  type="number"
                  min="0.001"
                  step="any"
                  required
                  placeholder="Ex: 50 ou 12.5"
                  value={quantidade}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setQuantidade(isNaN(val) ? '' : val);
                  }}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-zinc-100 font-mono text-base font-bold focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Seção Específica para Produtos com Controle de Lote */}
              {produtoSelecionado?.controla_lote && (
                <div className="p-3.5 rounded-lg border border-amber-800/50 bg-amber-950/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-xs">
                      <Layers className="w-4 h-4" />
                      <span>Rastreabilidade de Lote Obrigatória</span>
                    </div>

                    {lotesExistentes.length > 0 && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setModoLote('EXISTENTE');
                            setNumeroLote(lotesExistentes[0].numero_lote);
                            setDataValidade(lotesExistentes[0].data_validade || '');
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors ${
                            modoLote === 'EXISTENTE'
                              ? 'bg-amber-500 text-zinc-950'
                              : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          Lote Existente
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setModoLote('NOVO');
                            setNumeroLote('');
                            setDataValidade('');
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors ${
                            modoLote === 'NOVO'
                              ? 'bg-amber-500 text-zinc-950'
                              : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          Novo Lote
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Número do Lote */}
                    <div>
                      <label className="block text-zinc-400 font-mono uppercase text-[10px] mb-1 font-semibold">
                        Número do Lote *
                      </label>
                      {modoLote === 'EXISTENTE' && lotesExistentes.length > 0 ? (
                        <select
                          value={numeroLote}
                          onChange={(e) => handleSelecionarLoteExistente(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-zinc-200 font-mono focus:outline-none focus:border-amber-500"
                          required
                        >
                          {lotesExistentes.map((l) => (
                            <option key={l.id} value={l.numero_lote}>
                              {l.numero_lote} (Saldo: {l.saldo_lote})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          required
                          placeholder="Ex: LOTE-2026-A1"
                          value={numeroLote}
                          onChange={(e) => setNumeroLote(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-zinc-200 font-mono focus:outline-none focus:border-amber-500"
                        />
                      )}
                    </div>

                    {/* Data de Validade */}
                    <div>
                      <label className="block text-zinc-400 font-mono uppercase text-[10px] mb-1">
                        Data de Validade (Opcional)
                      </label>
                      <input
                        type="date"
                        value={dataValidade}
                        onChange={(e) => setDataValidade(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-zinc-200 font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Informações Complementares */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-mono uppercase text-[10px] mb-1">
                    Documento de Referência (NF / OS)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: NF 10452 / Pedido 382"
                    value={documentoRef}
                    onChange={(e) => setDocumentoRef(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-zinc-200 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 font-mono uppercase text-[10px] mb-1">
                    Origem / Fornecedor
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Fornecedor X / Compra Mensal"
                    value={motivoDestino}
                    onChange={(e) => setMotivoDestino(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-zinc-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 font-mono uppercase text-[10px] mb-1">
                  Observações Operacionais
                </label>
                <textarea
                  rows={2}
                  placeholder="Informações adicionais do recebimento..."
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-zinc-200 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              {/* Botões do Formulário */}
              <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={aoFechar}
                  className="px-4 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!produtoSelecionado || quantidade === '' || quantidade <= 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-zinc-100 font-semibold transition-colors disabled:opacity-50 shadow-xs"
                >
                  <span>Avançar para Confirmação</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          ) : (
            /* ETAPA 2: REVISÃO E CONFIRMAÇÃO EXPLÍCITA */
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800 space-y-3">
                <h3 className="font-semibold text-zinc-200 text-xs font-mono uppercase tracking-wider text-amber-400">
                  Resumo da Movimentação de Entrada
                </h3>

                {/* Declaração Explícita de Entrada */}
                <div className="p-3 bg-emerald-950/40 border border-emerald-800/80 rounded-md text-emerald-200 text-xs font-semibold leading-relaxed">
                  ESTOU REGISTRANDO UMA ENTRADA DE{' '}
                  <span className="text-emerald-400 font-bold underline">
                    {formatarQuantidade(Number(quantidade))} {produtoSelecionado?.unidade_medida}
                  </span>{' '}
                  DO MATERIAL &ldquo;{produtoSelecionado?.nome}&rdquo;.
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div>
                    <span className="text-zinc-500 font-mono block text-[10px]">Material:</span>
                    <span className="font-semibold text-zinc-100">{produtoSelecionado?.nome}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 font-mono block text-[10px]">Código / SKU:</span>
                    <span className="font-mono text-zinc-300">{produtoSelecionado?.codigo}</span>
                  </div>

                  <div>
                    <span className="text-zinc-500 font-mono block text-[10px]">Quantidade a Adicionar:</span>
                    <span className="font-mono text-base font-bold text-emerald-400">
                      +{formatarQuantidade(Number(quantidade), produtoSelecionado?.unidade_medida)}
                    </span>
                  </div>

                  <div>
                    <span className="text-zinc-500 font-mono block text-[10px]">Novo Saldo Calculado no Banco:</span>
                    <span className="font-mono text-sm font-semibold text-zinc-200">
                      {formatarQuantidade(
                        (produtoSelecionado?.saldo_atual || 0) + Number(quantidade),
                        produtoSelecionado?.unidade_medida
                      )}
                    </span>
                  </div>

                  {produtoSelecionado?.controla_lote && (
                    <>
                      <div>
                        <span className="text-zinc-500 font-mono block text-[10px]">Lote de Entrada:</span>
                        <span className="font-mono text-amber-400 font-semibold">{numeroLote}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 font-mono block text-[10px]">Data de Validade:</span>
                        <span className="font-mono text-zinc-300">
                          {dataValidade ? new Date(dataValidade).toLocaleDateString('pt-BR') : 'Não informada'}
                        </span>
                      </div>
                    </>
                  )}

                  {documentoRef && (
                    <div>
                      <span className="text-zinc-500 font-mono block text-[10px]">Documento:</span>
                      <span className="text-zinc-300 font-mono">{documentoRef}</span>
                    </div>
                  )}

                  {motivoDestino && (
                    <div>
                      <span className="text-zinc-500 font-mono block text-[10px]">Origem / Fornecedor:</span>
                      <span className="text-zinc-300">{motivoDestino}</span>
                    </div>
                  )}
                </div>

                {observacao && (
                  <div className="pt-2 border-t border-zinc-800 text-[11px] text-zinc-400">
                    <span className="text-zinc-500 font-mono block text-[10px]">Observações:</span>
                    <p className="mt-0.5">{observacao}</p>
                  </div>
                )}
              </div>

              <div className="p-2.5 rounded bg-zinc-950/60 border border-zinc-800 text-[11px] text-zinc-400 flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                <span>
                  Ao confirmar, a função transacional do banco (`registrar_entrada`) executará o lock no produto, registrará o evento imutável no ledger e atualizará o saldo de forma atômica.
                </span>
              </div>

              {/* Botões de Confirmação */}
              <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={processando}
                  onClick={() => setEtapaConfirmacao(false)}
                  className="px-4 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors disabled:opacity-50"
                >
                  Voltar / Corrigir
                </button>
                <button
                  type="button"
                  disabled={processando}
                  onClick={handleConfirmarEntrada}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-zinc-100 font-bold transition-colors disabled:opacity-50 shadow-xs"
                >
                  <CheckCircle2 className={`w-4 h-4 ${processando ? 'animate-spin' : ''}`} />
                  <span>{processando ? 'Processando Entrada...' : 'Confirmar Entrada'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
