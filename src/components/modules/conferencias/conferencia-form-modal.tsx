'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Produto, RegistrarConferenciaDTO, ResultadoOperacaoEstoque, Lote } from '@/types/stock';
import { stockService } from '@/services/stock-service';
import { lotService } from '@/services/lot-service';
import { formatarQuantidade, formatarDataSimples } from '@/lib/utils/formatters';
import { formatarErroBanco } from '@/lib/utils/error-handler';
import { 
  ClipboardCheck, 
  X, 
  Layers, 
  AlertCircle, 
  CheckCircle2, 
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  AlertTriangle
} from 'lucide-react';

interface ConferenciaFormModalProps {
  produtoInicial?: Produto | null;
  produtosDisponiveis: Produto[];
  aoSalvarSucesso: (resultado: ResultadoOperacaoEstoque, produtoId: string) => void;
  aoFechar: () => void;
}

export function ConferenciaFormModal({
  produtoInicial,
  produtosDisponiveis,
  aoSalvarSucesso,
  aoFechar,
}: ConferenciaFormModalProps) {
  // Apenas produtos ativos podem ser auditados
  const produtosAtivos = useMemo(() => {
    return produtosDisponiveis.filter((p) => p.ativo);
  }, [produtosDisponiveis]);

  // Seleção do produto
  const [produtoId, setProdutoId] = useState<string>(
    produtoInicial?.id || (produtosAtivos.length > 0 ? produtosAtivos[0].id : '')
  );

  const produtoSelecionado = useMemo(() => {
    return produtosAtivos.find((p) => p.id === produtoId) || null;
  }, [produtosAtivos, produtoId]);

  // Lotes do produto (caso controle lote)
  const [lotesDisponiveis, setLotesDisponiveis] = useState<Lote[]>([]);
  const [carregandoLotes, setCarregandoLotes] = useState(false);
  
  // Seleção MANUAL obrigatória de lote
  const [loteIdSelecionado, setLoteIdSelecionado] = useState<string>('');

  const loteSelecionado = useMemo(() => {
    if (!loteIdSelecionado) return null;
    return lotesDisponiveis.find((l) => l.id === loteIdSelecionado) || null;
  }, [lotesDisponiveis, loteIdSelecionado]);

  // Campos de contagem física
  const [quantidadeEncontrada, setQuantidadeEncontrada] = useState<number | ''>('');
  const [justificativa, setJustificativa] = useState('');
  const [observacao, setObservacao] = useState('');

  // Estados de controle
  const [etapaConfirmacao, setEtapaConfirmacao] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Busca lotes quando seleciona produto com controle de lote
  useEffect(() => {
    setLoteIdSelecionado('');
    setErro(null);

    if (!produtoSelecionado || !produtoSelecionado.controla_lote) {
      setLotesDisponiveis([]);
      return;
    }

    async function buscarLotes() {
      setCarregandoLotes(true);
      try {
        const dados = await lotService.listarPorProduto(produtoSelecionado!.id, false); // todos os lotes ativos
        setLotesDisponiveis(dados);
      } catch (err) {
        console.error('Falha ao buscar lotes:', err);
        setLotesDisponiveis([]);
      } finally {
        setCarregandoLotes(false);
      }
    }

    buscarLotes();
  }, [produtoSelecionado]);

  // Saldo registrado no sistema antes da contagem física
  const saldoRegistradoAtual = useMemo(() => {
    if (!produtoSelecionado) return 0;
    if (produtoSelecionado.controla_lote) {
      return loteSelecionado ? loteSelecionado.saldo_lote : 0;
    }
    return produtoSelecionado.saldo_atual;
  }, [produtoSelecionado, loteSelecionado]);

  // Cálculo da divergência estimada: quantidade_fisica - quantidade_anterior
  const diferencaCalculada = useMemo(() => {
    if (typeof quantidadeEncontrada !== 'number' || isNaN(quantidadeEncontrada)) {
      return null;
    }
    return quantidadeEncontrada - saldoRegistradoAtual;
  }, [quantidadeEncontrada, saldoRegistradoAtual]);

  const temDivergencia = diferencaCalculada !== null && diferencaCalculada !== 0;

  // Validação da etapa 1
  function handleAvancarParaConfirmacao(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (!produtoSelecionado) {
      setErro('Selecione um material ativo para auditar.');
      return;
    }

    if (!produtoSelecionado.ativo) {
      setErro('Operação bloqueada: Não é permitido registrar conferência física em um produto inativo.');
      return;
    }

    if (produtoSelecionado.controla_lote && !loteIdSelecionado) {
      setErro('Lote obrigatório: a conferência de produto com controle de lote deve ser realizada lote por lote.');
      return;
    }

    if (typeof quantidadeEncontrada !== 'number' || isNaN(quantidadeEncontrada) || quantidadeEncontrada < 0) {
      setErro('A quantidade física encontrada não pode ser negativa.');
      return;
    }

    if (temDivergencia && (!justificativa || !justificativa.trim())) {
      setErro('Justificativa obrigatória: qualquer ajuste com divergência de conferência física exige justificativa.');
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

  // Envio oficial via RPC registrar_conferencia_fisica
  async function handleConfirmarConferencia() {
    if (!produtoSelecionado) return;
    if (processando) return;

    setProcessando(true);
    setErro(null);

    try {
      const dto: RegistrarConferenciaDTO = {
        produto_id: produtoSelecionado.id,
        quantidade_encontrada: Number(quantidadeEncontrada),
        justificativa: justificativa.trim() || null,
        observacao: observacao.trim() || null,
        lote_id: produtoSelecionado.controla_lote ? loteIdSelecionado : null,
      };

      const resultado = await stockService.registrarConferencia(dto, produtoSelecionado, loteSelecionado);

      aoSalvarSucesso(resultado, produtoSelecionado.id);
    } catch (err: any) {
      console.error('Erro ao registrar conferência física:', err);
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
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded bg-amber-950/60 border border-amber-800/60 text-amber-400">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                Conferência Física de Estoque
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                  Auditoria Física
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                {etapaConfirmacao
                  ? 'Revise os dados apurados antes de confirmar a gravação definitiva'
                  : 'Informe a quantidade real encontrada na contagem do inventário'}
              </p>
            </div>
          </div>
          <button
            onClick={aoFechar}
            disabled={processando}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 rounded-md hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo */}
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
            <form id="form-conferencia" onSubmit={handleAvancarParaConfirmacao} className="space-y-4">
              {/* Seleção de Material */}
              <div>
                <label className="block text-xs font-mono uppercase text-zinc-400 mb-1.5">
                  Material Auditado <span className="text-amber-500">*</span>
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
                      [{p.codigo}] {p.nome} — Saldo Sistema: {formatarQuantidade(p.saldo_atual)} {p.unidade_medida} {p.controla_lote ? '(Controla Lote)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Informações Resumidas do Produto */}
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
                    <span className="text-zinc-500 font-mono block text-[10px] uppercase">Saldo Consolidado:</span>
                    <span className="font-mono font-bold text-zinc-100">
                      {formatarQuantidade(produtoSelecionado.saldo_atual)} {produtoSelecionado.unidade_medida}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 font-mono block text-[10px] uppercase">Modalidade:</span>
                    <span className={`font-mono text-[11px] ${produtoSelecionado.controla_lote ? 'text-amber-400' : 'text-zinc-400'}`}>
                      {produtoSelecionado.controla_lote ? 'Lote por Lote' : 'Saldo Consolidado'}
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
                        Lote Físico em Conferência (Obrigatório) <span className="text-amber-500">*</span>
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
                        Nenhum lote localizado para este produto. Cadastre uma entrada ou lote antes de auditar.
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
                        <option value="">-- Selecione o lote específico que está sendo contado --</option>
                        {lotesDisponiveis.map((l) => (
                          <option key={l.id} value={l.id}>
                            Lote: {l.numero_lote} | Saldo Registrado: {formatarQuantidade(l.saldo_lote)} {produtoSelecionado.unidade_medida}
                            {l.data_validade ? ` | Validade: ${formatarDataSimples(l.data_validade)}` : ''}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Cada lote é auditado individualmente. A conferência nunca afeta os saldos dos outros lotes.
                      </p>
                    </div>
                  )}

                  {loteSelecionado && (
                    <div className="p-2.5 bg-zinc-900 border border-zinc-800 rounded flex items-center justify-between text-xs font-mono">
                      <div className="text-zinc-400">
                        Saldo Registrado no Lote <span className="text-amber-400 font-bold">{loteSelecionado.numero_lote}</span>:
                      </div>
                      <div className="text-zinc-100 font-bold">
                        {formatarQuantidade(loteSelecionado.saldo_lote)} {produtoSelecionado.unidade_medida}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Quantidade Física Encontrada */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-mono uppercase text-zinc-400">
                    Quantidade Física Encontrada ({produtoSelecionado?.unidade_medida}) <span className="text-amber-500">*</span>
                  </label>
                  <span className="text-[11px] font-mono text-zinc-500">
                    Registrado:{' '}
                    <strong className="text-zinc-300">
                      {formatarQuantidade(saldoRegistradoAtual)} {produtoSelecionado?.unidade_medida}
                    </strong>
                  </span>
                </div>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={quantidadeEncontrada}
                  onChange={(e) => {
                    const val = e.target.value;
                    setQuantidadeEncontrada(val === '' ? '' : parseFloat(val));
                  }}
                  placeholder="Informe o valor contado fisicamente (zero é permitido)"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-amber-500 transition-colors font-mono"
                  required
                />
              </div>

              {/* Indicador Visual da Divergência */}
              {diferencaCalculada !== null && (
                <div
                  className={`p-3 rounded-md border flex items-center justify-between text-xs font-mono ${
                    diferencaCalculada === 0
                      ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                      : diferencaCalculada > 0
                      ? 'bg-sky-950/40 border-sky-800/60 text-sky-300'
                      : 'bg-amber-950/40 border-amber-800/60 text-amber-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {diferencaCalculada === 0 ? (
                      <Minus className="w-4 h-4 text-emerald-400" />
                    ) : diferencaCalculada > 0 ? (
                      <TrendingUp className="w-4 h-4 text-sky-400" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-amber-400" />
                    )}
                    <span className="font-semibold">
                      {diferencaCalculada === 0
                        ? 'Estoque Conferido: Sem divergência apurada'
                        : diferencaCalculada > 0
                        ? 'Divergência Positiva (Sobra Física)'
                        : 'Divergência Negativa (Falta Física)'}
                    </span>
                  </div>
                  <div className="font-bold text-sm">
                    {diferencaCalculada > 0 ? `+${formatarQuantidade(diferencaCalculada)}` : formatarQuantidade(diferencaCalculada)}{' '}
                    {produtoSelecionado?.unidade_medida}
                  </div>
                </div>
              )}

              {/* Justificativa (Obrigatória em caso de divergência) */}
              <div>
                <label className="block text-xs font-mono uppercase text-zinc-400 mb-1.5">
                  Justificativa da Divergência {temDivergencia && <span className="text-amber-500">* (Obrigatória)</span>}
                </label>
                <input
                  type="text"
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  placeholder={
                    temDivergencia
                      ? 'Ex: Avaria física em transporte, perda por evaporação, consumo sem baixa anterior'
                      : 'Opcional quando não há divergência'
                  }
                  required={temDivergencia}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              {/* Observações Complementares */}
              <div>
                <label className="block text-xs font-mono uppercase text-zinc-400 mb-1.5">
                  Observações Gerais da Auditoria
                </label>
                <textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  rows={2}
                  placeholder="Detalhes adicionais da contagem para auditoria..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-amber-500 transition-colors resize-none"
                />
              </div>
            </form>
          ) : (
            /* ETAPA 2: CONFIRMAÇÃO EXPLÍCITA */
            <div className="space-y-4">
              <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg space-y-3">
                <div className="flex items-center gap-2 text-xs font-mono uppercase text-amber-500 font-semibold border-b border-zinc-800 pb-2">
                  <ClipboardCheck className="w-4 h-4" />
                  Resumo da Auditoria Física
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
                    <span className="text-zinc-500 font-mono block text-[10px] uppercase">Saldo Anterior (Sistema):</span>
                    <span className="font-mono text-zinc-300 font-semibold">
                      {formatarQuantidade(saldoRegistradoAtual)} {produtoSelecionado?.unidade_medida}
                    </span>
                  </div>

                  <div>
                    <span className="text-zinc-500 font-mono block text-[10px] uppercase">Quantidade Física Encontrada:</span>
                    <span className="font-mono font-bold text-amber-400 text-sm">
                      {formatarQuantidade(Number(quantidadeEncontrada))} {produtoSelecionado?.unidade_medida}
                    </span>
                  </div>

                  <div className="col-span-2 p-2.5 bg-zinc-900/70 border border-zinc-800 rounded flex items-center justify-between font-mono">
                    <span className="text-zinc-400 text-[11px] uppercase">Diferença / Ajuste:</span>
                    <span className={`font-bold ${
                      diferencaCalculada === 0
                        ? 'text-emerald-400'
                        : (diferencaCalculada || 0) > 0
                        ? 'text-sky-400'
                        : 'text-amber-400'
                    }`}>
                      {(diferencaCalculada || 0) > 0 ? `+${formatarQuantidade(diferencaCalculada || 0)}` : formatarQuantidade(diferencaCalculada || 0)}{' '}
                      {produtoSelecionado?.unidade_medida}
                    </span>
                  </div>

                  <div>
                    <span className="text-zinc-500 font-mono block text-[10px] uppercase">Lote Auditado:</span>
                    <span className="font-mono font-semibold text-zinc-200">
                      {produtoSelecionado?.controla_lote
                        ? loteSelecionado?.numero_lote || 'Não informado'
                        : 'Não aplicável (sem lote)'}
                    </span>
                  </div>

                  {justificativa && (
                    <div className="col-span-2">
                      <span className="text-zinc-500 font-mono block text-[10px] uppercase">Justificativa:</span>
                      <span className="text-zinc-200">{justificativa}</span>
                    </div>
                  )}

                  {observacao && (
                    <div className="col-span-2">
                      <span className="text-zinc-500 font-mono block text-[10px] uppercase">Observação:</span>
                      <span className="text-zinc-400 italic">{observacao}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-md text-xs text-zinc-400 flex items-start gap-2">
                <Clock className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                <div>
                  A conferência física será lançada de forma imutável (append-only) no histórico e, havendo divergência, o ajuste correspondente será gerado automaticamente no livro-razão (ledger).
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé */}
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
                form="form-conferencia"
                disabled={produtoSelecionado?.controla_lote && !loteIdSelecionado}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-amber-600 hover:bg-amber-500 text-zinc-950 text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-xs cursor-pointer"
              >
                <span>Avançar para Revisão</span>
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
                onClick={handleConfirmarConferencia}
                disabled={processando}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md cursor-pointer"
              >
                {processando ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                    <span>Gravando Conferência...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirmar Auditoria Definitiva</span>
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
