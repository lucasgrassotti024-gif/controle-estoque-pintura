'use client';

import React, { useState, useEffect } from 'react';
import { Produto, Lote, ResultadoOperacaoEstoque } from '@/types/stock';
import { stockService } from '@/services/stock-service';
import { lotService } from '@/services/lot-service';
import { formatarQuantidade } from '@/lib/utils/formatters';
import { 
  Sliders, 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  Loader2, 
  Layers, 
  ShieldAlert,
  ArrowRight
} from 'lucide-react';

interface AjusteEstoqueModalProps {
  produto: Produto | null;
  aoSucesso: (resultado: ResultadoOperacaoEstoque) => void;
  aoFechar: () => void;
}

export function AjusteEstoqueModal({
  produto,
  aoSucesso,
  aoFechar,
}: AjusteEstoqueModalProps) {
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [loteSelecionadoId, setLoteSelecionadoId] = useState<string>('');
  const [carregandoLotes, setCarregandoLotes] = useState(false);

  const [novoSaldoStr, setNovoSaldoStr] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [observacao, setObservacao] = useState('');

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Carregar lotes se o produto controlar lote
  useEffect(() => {
    if (!produto || !produto.controla_lote) {
      setLotes([]);
      setLoteSelecionadoId('');
      return;
    }

    async function carregarLotes() {
      setCarregandoLotes(true);
      try {
        const dadosLotes = await lotService.listarPorProduto(produto!.id, false);
        setLotes(dadosLotes);
        if (dadosLotes.length > 0) {
          setLoteSelecionadoId(dadosLotes[0].id);
        }
      } catch (err: any) {
        setErro(err.message || 'Erro ao carregar lotes para ajuste.');
      } finally {
        setCarregandoLotes(false);
      }
    }

    carregarLotes();
  }, [produto]);

  // Saldo base anterior
  const loteAtual = lotes.find((l) => l.id === loteSelecionadoId);
  const saldoAnterior = produto?.controla_lote 
    ? (loteAtual ? loteAtual.saldo_lote : 0) 
    : (produto?.saldo_atual || 0);

  const novoSaldoNum = novoSaldoStr !== '' ? parseFloat(novoSaldoStr) : NaN;
  const diferenca = !isNaN(novoSaldoNum) ? novoSaldoNum - saldoAnterior : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!produto) return;
    setErro(null);

    if (isNaN(novoSaldoNum) || novoSaldoNum < 0) {
      setErro('Informe um novo saldo numérico válido maior ou igual a zero.');
      return;
    }

    if (diferenca === 0) {
      setErro('O novo saldo informado é idêntico ao saldo atual. Não há divergência para ajustar.');
      return;
    }

    if (!justificativa.trim()) {
      setErro('A justificativa é estritamente obrigatória para auditoria de ajustes de estoque.');
      return;
    }

    if (produto.controla_lote && !loteSelecionadoId) {
      setErro('Selecione o lote a ser ajustado.');
      return;
    }

    setSalvando(true);

    try {
      const res = await stockService.ajustarEstoque({
        produto_id: produto.id,
        novo_saldo: novoSaldoNum,
        justificativa: justificativa.trim(),
        lote_id: produto.controla_lote ? loteSelecionadoId : undefined,
        observacao: observacao.trim() || undefined,
        snapshot_version_produto: produto.version,
        snapshot_version_lote: loteAtual?.version,
      });

      aoSucesso(res);
      aoFechar();
    } catch (err: any) {
      setErro(err.message || 'Falha ao processar ajuste administrativo.');
    } finally {
      setSalvando(false);
    }
  }

  if (!produto) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget && !salvando) aoFechar();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
        {/* Header com destaque administrativo */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-zinc-800 bg-zinc-950/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-950/60 border border-amber-800/80 flex items-center justify-center text-amber-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 block font-semibold">
                Administração de Estoque
              </span>
              <h2 className="text-base font-bold text-white leading-tight">
                Ajuste Contábil de Saldo
              </h2>
            </div>
          </div>
          <button
            onClick={aoFechar}
            disabled={salvando}
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 text-sm">
          {/* Identificação do Material */}
          <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
            <div className="text-xs font-mono text-zinc-500 uppercase">Material</div>
            <div className="text-sm font-semibold text-zinc-200">
              {produto.codigo} — {produto.nome}
            </div>
          </div>

          {/* Seletor de Lote (se aplicável) */}
          {produto.controla_lote && (
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-1.5">
                Lote a ser ajustado *
              </label>
              {carregandoLotes ? (
                <div className="flex items-center gap-2 text-xs text-zinc-500 py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  Carregando lotes...
                </div>
              ) : lotes.length === 0 ? (
                <div className="p-2.5 rounded bg-red-950/30 border border-red-800/50 text-red-300 text-xs">
                  Nenhum lote encontrado para este material.
                </div>
              ) : (
                <select
                  value={loteSelecionadoId}
                  onChange={(e) => setLoteSelecionadoId(e.target.value)}
                  disabled={salvando}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                >
                  {lotes.map((l) => (
                    <option key={l.id} value={l.id}>
                      Lote: {l.numero_lote} | Saldo: {formatarQuantidade(l.saldo_lote, produto.unidade_medida)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Painel Comparativo: Saldo Atual vs Novo Saldo */}
          <div className="grid grid-cols-3 gap-2.5 p-3 rounded-lg bg-zinc-950/70 border border-zinc-800 items-center text-center">
            <div>
              <span className="text-[10px] font-mono text-zinc-500 uppercase block">Saldo Atual</span>
              <span className="font-mono text-sm font-bold text-zinc-300">
                {formatarQuantidade(saldoAnterior, produto.unidade_medida)}
              </span>
            </div>

            <div className="flex justify-center text-zinc-600">
              <ArrowRight className="w-4 h-4" />
            </div>

            <div>
              <span className="text-[10px] font-mono text-zinc-500 uppercase block">Diferença</span>
              <span className={`font-mono text-sm font-bold ${
                diferenca > 0 
                  ? 'text-emerald-400' 
                  : diferenca < 0 
                  ? 'text-rose-400' 
                  : 'text-zinc-500'
              }`}>
                {diferenca > 0 ? `+${diferenca}` : diferenca} {produto.unidade_medida}
              </span>
            </div>
          </div>

          {/* Input do Novo Saldo */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-zinc-300 mb-1.5">
              Novo Saldo Físico ({produto.unidade_medida}) *
            </label>
            <input
              type="number"
              step="any"
              min="0"
              required
              disabled={salvando}
              value={novoSaldoStr}
              onChange={(e) => setNovoSaldoStr(e.target.value)}
              placeholder={`ex: ${saldoAnterior}`}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-white font-mono text-sm placeholder-zinc-600 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Justificativa Obrigatória */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-zinc-300 mb-1.5 flex items-center justify-between">
              <span>Justificativa da Auditoria *</span>
              <span className="text-[10px] text-amber-400">Obrigatório</span>
            </label>
            <textarea
              required
              rows={2}
              disabled={salvando}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Descreva o motivo contábil (ex: Quebra de embalagem, evaporação técnica, inventário fiscal)."
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          {/* Observação Opcional */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-1.5">
              Observação Complementar (Opcional)
            </label>
            <input
              type="text"
              disabled={salvando}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="ex: Chamado interno #8410"
              className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded-lg text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Aviso de Auditoria e Imutabilidade */}
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-950/30 border border-amber-800/40 text-[11px] text-amber-300/90">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <span>
              Toda alteração de saldo é atômica, auditada e gera lançamento no livro-razão append-only. Seu usuário ADMIN será registrado como executor.
            </span>
          </div>

          {/* Mensagem de Erro */}
          {erro && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{erro}</span>
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={aoFechar}
              disabled={salvando}
              className="px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs font-medium transition disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando || isNaN(novoSaldoNum) || diferenca === 0 || !justificativa.trim()}
              className="flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-500 text-zinc-950 font-semibold text-xs rounded-lg shadow transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {salvando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-950" />
                  <span>Gravando Ajuste...</span>
                </>
              ) : (
                <>
                  <Sliders className="w-4 h-4" />
                  <span>Confirmar Ajuste</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
