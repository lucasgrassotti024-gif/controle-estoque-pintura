import React from 'react';
import { Produto, SituacaoEstoque } from '@/types/stock';
import { SituacaoBadge } from '@/components/ui/situacao-badge';
import { formatarQuantidade } from '@/lib/utils/formatters';
import { 
  Layers, 
  ChevronRight, 
  ArrowDownLeft, 
  ArrowUpRight, 
  ClipboardCheck,
  Eye
} from 'lucide-react';

interface TabelaEstoqueProps {
  itens: {
    produto: Produto;
    situacao: SituacaoEstoque;
  }[];
  onSelecionarProduto: (produto: Produto) => void;
  podeMovimentar?: boolean;
  onRegistrarEntrada?: (produto: Produto) => void;
  onRegistrarSaida?: (produto: Produto) => void;
  onRealizarConferencia?: (produto: Produto) => void;
}

export function TabelaEstoque({ 
  itens, 
  onSelecionarProduto,
  podeMovimentar = false,
  onRegistrarEntrada,
  onRegistrarSaida,
  onRealizarConferencia,
}: TabelaEstoqueProps) {
  return (
    <>
      {/* 1. Visão Desktop / Tablet: Tabela Limpa de Alta Densidade */}
      <div className="hidden md:block overflow-x-auto border border-zinc-800 rounded-lg bg-zinc-950/60 shadow-xs">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/70 text-zinc-400 font-mono text-xs uppercase tracking-wider">
              <th className="py-3 px-4">Código</th>
              <th className="py-3 px-4">Material</th>
              <th className="py-3 px-4">Categoria</th>
              <th className="py-3 px-4 text-right">Saldo Atual</th>
              <th className="py-3 px-4 text-right">Estoque Mínimo</th>
              <th className="py-3 px-4 text-center">Lotes</th>
              <th className="py-3 px-4">Situação</th>
              <th className="py-3 px-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {itens.map(({ produto, situacao }) => (
              <tr
                key={produto.id}
                className="hover:bg-zinc-900/60 transition-colors group"
              >
                <td 
                  onClick={() => onSelecionarProduto(produto)}
                  className="py-3 px-4 font-mono text-xs font-semibold text-amber-400/90 whitespace-nowrap cursor-pointer"
                >
                  {produto.codigo}
                </td>
                <td 
                  onClick={() => onSelecionarProduto(produto)}
                  className="py-3 px-4 cursor-pointer"
                >
                  <div className="font-medium text-zinc-200 group-hover:text-amber-400 transition-colors">
                    {produto.nome}
                  </div>
                  {produto.localizacao && (
                    <div className="text-xs text-zinc-500 font-mono">
                      Local: {produto.localizacao}
                    </div>
                  )}
                </td>
                <td 
                  onClick={() => onSelecionarProduto(produto)}
                  className="py-3 px-4 text-zinc-400 text-xs cursor-pointer"
                >
                  <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700/60">
                    {produto.categoria}
                  </span>
                </td>
                <td 
                  onClick={() => onSelecionarProduto(produto)}
                  className="py-3 px-4 text-right font-mono font-bold text-zinc-100 text-base cursor-pointer"
                >
                  {formatarQuantidade(produto.saldo_atual, produto.unidade_medida)}
                </td>
                <td 
                  onClick={() => onSelecionarProduto(produto)}
                  className="py-3 px-4 text-right font-mono text-zinc-400 text-xs cursor-pointer"
                >
                  {formatarQuantidade(produto.estoque_minimo, produto.unidade_medida)}
                </td>
                <td 
                  onClick={() => onSelecionarProduto(produto)}
                  className="py-3 px-4 text-center cursor-pointer"
                >
                  {produto.controla_lote ? (
                    <span className="inline-flex items-center gap-1 text-xs text-zinc-300 font-mono bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-700/80">
                      <Layers className="w-3 h-3 text-amber-400" />
                      Lote
                    </span>
                  ) : (
                    <span className="text-zinc-600 text-xs font-mono">-</span>
                  )}
                </td>
                <td 
                  onClick={() => onSelecionarProduto(produto)}
                  className="py-3 px-4 cursor-pointer"
                >
                  <SituacaoBadge situacao={situacao} />
                </td>
                <td className="py-3 px-4 text-right whitespace-nowrap space-x-1">
                  {podeMovimentar && (
                    <>
                      <button
                        onClick={() => onRegistrarEntrada?.(produto)}
                        className="p-1.5 rounded hover:bg-emerald-950/40 text-zinc-400 hover:text-emerald-400 transition-colors cursor-pointer"
                        title="Registrar entrada deste material"
                        aria-label={`Registrar entrada de ${produto.nome}`}
                      >
                        <ArrowDownLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onRegistrarSaida?.(produto)}
                        disabled={produto.saldo_atual <= 0}
                        className="p-1.5 rounded hover:bg-amber-950/40 text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        title={produto.saldo_atual <= 0 ? 'Sem saldo disponível para saída' : 'Registrar saída deste material'}
                        aria-label={`Registrar saída de ${produto.nome}`}
                      >
                        <ArrowUpRight className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onRealizarConferencia?.(produto)}
                        className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer"
                        title="Realizar conferência física deste material"
                        aria-label={`Auditar ${produto.nome}`}
                      >
                        <ClipboardCheck className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => onSelecionarProduto(produto)}
                    className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
                    title="Visualizar detalhes completos"
                    aria-label={`Ver detalhes de ${produto.nome}`}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 2. Visão Mobile: Cards Operacionais com Toque Fácil e Ações Rápidas */}
      <div className="md:hidden space-y-3">
        {itens.map(({ produto, situacao }) => (
          <div
            key={produto.id}
            className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800 transition-colors space-y-3 shadow-xs"
          >
            <div 
              onClick={() => onSelecionarProduto(produto)}
              className="flex items-start justify-between gap-2 cursor-pointer"
            >
              <div>
                <span className="text-xs font-mono text-amber-400 font-semibold uppercase">
                  {produto.codigo}
                </span>
                <h3 className="text-sm font-semibold text-zinc-100 leading-tight">
                  {produto.nome}
                </h3>
              </div>
              <SituacaoBadge situacao={situacao} tamanho="sm" />
            </div>

            <div 
              onClick={() => onSelecionarProduto(produto)}
              className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800/60 text-xs cursor-pointer"
            >
              <div>
                <span className="text-zinc-500 block uppercase font-mono text-[10px]">Saldo Atual</span>
                <span className="font-mono text-base font-bold text-zinc-100">
                  {formatarQuantidade(produto.saldo_atual, produto.unidade_medida)}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 block uppercase font-mono text-[10px]">Estoque Mínimo</span>
                <span className="font-mono text-xs text-zinc-300">
                  {formatarQuantidade(produto.estoque_minimo, produto.unidade_medida)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-400 pt-2 border-t border-zinc-800/60">
              <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[11px]">
                {produto.categoria}
              </span>

              {podeMovimentar ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onRegistrarEntrada?.(produto)}
                    className="p-1.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 text-xs font-mono cursor-pointer"
                    title="Entrada"
                    aria-label={`Entrada ${produto.nome}`}
                  >
                    <ArrowDownLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onRegistrarSaida?.(produto)}
                    disabled={produto.saldo_atual <= 0}
                    className="p-1.5 rounded bg-amber-950/60 border border-amber-800/60 text-amber-400 text-xs font-mono cursor-pointer disabled:opacity-30"
                    title="Saída"
                    aria-label={`Saída ${produto.nome}`}
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onRealizarConferencia?.(produto)}
                    className="p-1.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-mono cursor-pointer"
                    title="Conferência"
                    aria-label={`Auditar ${produto.nome}`}
                  >
                    <ClipboardCheck className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onSelecionarProduto(produto)}
                  className="text-xs text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Ver Detalhes
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
