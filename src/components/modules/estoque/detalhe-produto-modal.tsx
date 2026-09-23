'use client';

import React, { useEffect, useState } from 'react';
import { Produto, Lote, SituacaoEstoque } from '@/types/stock';
import { lotService } from '@/services/lot-service';
import { SituacaoBadge } from '@/components/ui/situacao-badge';
import { formatarQuantidade, formatarDataHora } from '@/lib/utils/formatters';
import { X, Layers, Calendar, AlertCircle, Package } from 'lucide-react';

interface DetalheProdutoModalProps {
  produto: Produto | null;
  situacao: SituacaoEstoque;
  aoFechar: () => void;
}

export function DetalheProdutoModal({
  produto,
  situacao,
  aoFechar,
}: DetalheProdutoModalProps) {
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [carregandoLotes, setCarregandoLotes] = useState(false);
  const [erroLotes, setErroLotes] = useState<string | null>(null);

  useEffect(() => {
    if (!produto || !produto.controla_lote) {
      setLotes([]);
      return;
    }

    async function buscarLotes() {
      setCarregandoLotes(true);
      setErroLotes(null);
      try {
        const dados = await lotService.listarPorProduto(produto!.id);
        setLotes(dados);
      } catch (err: any) {
        setErroLotes(err.message || 'Erro ao carregar lotes do material.');
      } finally {
        setCarregandoLotes(false);
      }
    }

    buscarLotes();
  }, [produto]);

  // Suporte a fechamento por tecla Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        aoFechar();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [aoFechar]);

  if (!produto) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-detalhe-titulo"
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header do Modal */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-amber-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-mono text-amber-400 font-semibold uppercase block">
                {produto.codigo}
              </span>
              <h2 id="modal-detalhe-titulo" className="text-base font-bold text-zinc-100 leading-tight">
                {produto.nome}
              </h2>
            </div>
          </div>
          <button
            onClick={aoFechar}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            aria-label="Fechar detalhes"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          {/* Informações Básicas do Material */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
            <div>
              <span className="text-[10px] text-zinc-500 uppercase font-mono block">Saldo Atual</span>
              <span className="font-mono text-lg font-bold text-zinc-100">
                {formatarQuantidade(produto.saldo_atual, produto.unidade_medida)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase font-mono block">Estoque Mínimo</span>
              <span className="font-mono text-sm font-semibold text-zinc-300">
                {formatarQuantidade(produto.estoque_minimo, produto.unidade_medida)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase font-mono block">Categoria</span>
              <span className="text-xs font-medium text-zinc-200">
                {produto.categoria}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase font-mono block">Situação</span>
              <div className="mt-0.5">
                <SituacaoBadge situacao={situacao} tamanho="sm" />
              </div>
            </div>
          </div>

          {/* Dados Complementares */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="space-y-1">
              <span className="text-zinc-500 font-mono">Localização Física:</span>
              <p className="text-zinc-300 font-medium">{produto.localizacao || 'Não informada'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-zinc-500 font-mono">Fabricante / Marca:</span>
              <p className="text-zinc-300 font-medium">{produto.fabricante || 'Não informado'}</p>
            </div>
            {produto.descricao && (
              <div className="sm:col-span-2 space-y-1 pt-1">
                <span className="text-zinc-500 font-mono">Descrição Técnica:</span>
                <p className="text-zinc-300 bg-zinc-950/50 p-2.5 rounded border border-zinc-800/50 leading-relaxed">
                  {produto.descricao}
                </p>
              </div>
            )}
          </div>

          {/* Seção de Lotes (quando aplicável) */}
          <div className="pt-3 border-t border-zinc-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-zinc-200">
                  Rastreabilidade de Lotes
                </h3>
              </div>
              <span className="text-xs text-zinc-500 font-mono">
                {produto.controla_lote ? `${lotes.length} lotes registrados` : 'Produto sem controle de lote'}
              </span>
            </div>

            {!produto.controla_lote ? (
              <div className="text-xs text-zinc-500 bg-zinc-950/40 p-3 rounded border border-zinc-800/60">
                Este material é controlado exclusivamente pelo saldo consolidado único, sem fracionamento por lote.
              </div>
            ) : carregandoLotes ? (
              <div className="text-xs text-zinc-400 py-4 text-center">
                Carregando histórico de lotes...
              </div>
            ) : erroLotes ? (
              <div className="text-xs text-red-400 bg-red-950/40 border border-red-900/60 p-3 rounded flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{erroLotes}</span>
              </div>
            ) : lotes.length === 0 ? (
              <div className="text-xs text-zinc-500 bg-zinc-950/40 p-4 rounded border border-zinc-800/60 text-center">
                Nenhum lote cadastrado para este material até o momento.
              </div>
            ) : (
              <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950/40">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900/70 border-b border-zinc-800 text-zinc-400 font-mono uppercase text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3">Número do Lote</th>
                      <th className="py-2.5 px-3 text-right">Saldo do Lote</th>
                      <th className="py-2.5 px-3">Data de Validade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {lotes.map((lote) => (
                      <tr key={lote.id} className="hover:bg-zinc-900/30">
                        <td className="py-2.5 px-3 font-mono text-zinc-200 font-medium">
                          {lote.numero_lote}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-zinc-100">
                          {formatarQuantidade(lote.saldo_lote, produto.unidade_medida)}
                        </td>
                        <td className="py-2.5 px-3 text-zinc-400 font-mono">
                          {lote.data_validade ? (
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-zinc-500" />
                              {new Date(lote.data_validade).toLocaleDateString('pt-BR')}
                            </span>
                          ) : (
                            <span className="text-zinc-600">Não informada</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Rodapé Informativo */}
        <div className="p-3 sm:p-4 border-t border-zinc-800 bg-zinc-950/60 flex items-center justify-between text-xs text-zinc-500 font-mono">
          <span>Criado em: {formatarDataHora(produto.criado_em)}</span>
          <button
            onClick={aoFechar}
            className="px-4 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
