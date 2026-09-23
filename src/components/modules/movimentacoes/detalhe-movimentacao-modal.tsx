'use client';

import React from 'react';
import { Movimentacao } from '@/types/stock';
import { formatarQuantidade, formatarDataHora } from '@/lib/utils/formatters';
import { 
  ArrowLeftRight, 
  X, 
  ArrowDownLeft, 
  ArrowUpRight, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  User, 
  FileText, 
  Layers, 
  ClipboardCheck,
  Tag,
  Clock
} from 'lucide-react';

interface DetalheMovimentacaoModalProps {
  movimentacao: Movimentacao;
  aoFechar: () => void;
}

export function DetalheMovimentacaoModal({
  movimentacao,
  aoFechar,
}: DetalheMovimentacaoModalProps) {
  // Suporte a fechamento por tecla Escape
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        aoFechar();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [aoFechar]);

  // Configurações visuais e contextuais por tipo de movimentação
  const configTipo = (() => {
    switch (movimentacao.tipo) {
      case 'ENTRADA':
        return {
          label: 'Entrada de Estoque',
          badgeClass: 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80',
          icon: <ArrowDownLeft className="w-4 h-4 text-emerald-400" />,
          descricaoOrigem: 'Recebimento de materiais no estoque via processo operacional de entrada.',
          sinal: '+',
          corSinal: 'text-emerald-400',
        };
      case 'SAIDA':
        return {
          label: 'Saída de Estoque',
          badgeClass: 'bg-amber-950/80 text-amber-400 border-amber-800/80',
          icon: <ArrowUpRight className="w-4 h-4 text-amber-400" />,
          descricaoOrigem: 'Baixa de materiais do inventário para consumo, aplicação ou ordem de produção.',
          sinal: '-',
          corSinal: 'text-amber-400',
        };
      case 'AJUSTE_ENTRADA':
        return {
          label: 'Ajuste de Entrada (Sobra Física)',
          badgeClass: 'bg-sky-950/80 text-sky-400 border-sky-800/80',
          icon: <TrendingUp className="w-4 h-4 text-sky-400" />,
          descricaoOrigem: 'Ajuste gerado automaticamente pelo banco por apuração de sobra em conferência física de auditoria.',
          sinal: '+',
          corSinal: 'text-sky-400',
        };
      case 'AJUSTE_SAIDA':
        return {
          label: 'Ajuste de Saída (Falta Física)',
          badgeClass: 'bg-rose-950/80 text-rose-400 border-rose-800/80',
          icon: <TrendingDown className="w-4 h-4 text-rose-400" />,
          descricaoOrigem: 'Ajuste gerado automaticamente pelo banco por apuração de falta em conferência física de auditoria.',
          sinal: '-',
          corSinal: 'text-rose-400',
        };
      case 'CONFERENCIA_FISICA':
      default:
        return {
          label: 'Conferência Física',
          badgeClass: 'bg-purple-950/80 text-purple-400 border-purple-800/80',
          icon: <ClipboardCheck className="w-4 h-4 text-purple-400" />,
          descricaoOrigem: 'Registro auditado de inventário físico.',
          sinal: '',
          corSinal: 'text-zinc-200',
        };
    }
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">
              <ArrowLeftRight className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                Registro do Livro-Razão
                <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${configTipo.badgeClass}`}>
                  {movimentacao.tipo}
                </span>
              </h2>
              <p className="text-xs text-zinc-400 font-mono">ID: {movimentacao.id}</p>
            </div>
          </div>
          <button
            onClick={aoFechar}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 rounded-md hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo com Informações Auditáveis */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* Card com Quantidade e Tipo */}
          <div className="p-4 rounded-lg bg-zinc-950/80 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                {configTipo.icon}
                <span className="font-semibold text-sm text-zinc-100">{configTipo.label}</span>
              </div>
              <p className="text-zinc-400 text-[11px] leading-relaxed max-w-sm">
                {configTipo.descricaoOrigem}
              </p>
            </div>

            <div className="text-right sm:border-l sm:border-zinc-800 sm:pl-4">
              <span className="text-zinc-500 font-mono block text-[10px] uppercase">Movimentado</span>
              <span className={`font-mono text-xl font-bold ${configTipo.corSinal}`}>
                {configTipo.sinal} {formatarQuantidade(movimentacao.quantidade)} {movimentacao.produto_unidade || ''}
              </span>
            </div>
          </div>

          {/* Dados do Material */}
          <div className="p-3.5 bg-zinc-950/60 border border-zinc-800 rounded-md grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-2">
              <span className="text-zinc-500 font-mono block text-[10px] uppercase">Material</span>
              <span className="font-semibold text-zinc-100 text-sm">{movimentacao.produto_nome || 'Não identificado'}</span>
            </div>
            <div>
              <span className="text-zinc-500 font-mono block text-[10px] uppercase">Código / SKU</span>
              <span className="font-mono text-amber-400 font-bold">{movimentacao.produto_codigo || 'N/A'}</span>
            </div>
            <div>
              <span className="text-zinc-500 font-mono block text-[10px] uppercase">Lote</span>
              <span className="font-mono text-zinc-200">
                {movimentacao.lote_numero ? (
                  <span className="inline-flex items-center gap-1 text-amber-400 font-semibold">
                    <Layers className="w-3 h-3" />
                    {movimentacao.lote_numero}
                  </span>
                ) : (
                  <span className="text-zinc-500 italic">Sem lote</span>
                )}
              </span>
            </div>
          </div>

          {/* Comparativo de Saldos no Momento da Transação */}
          <div className="grid grid-cols-3 gap-2 p-3 bg-zinc-950/40 border border-zinc-800/60 rounded-md font-mono text-center">
            <div>
              <span className="text-zinc-500 block text-[10px] uppercase">Saldo Anterior</span>
              <span className="text-zinc-400 font-bold text-sm">
                {formatarQuantidade(movimentacao.saldo_anterior)} {movimentacao.produto_unidade || ''}
              </span>
            </div>
            <div className="border-x border-zinc-800/80">
              <span className="text-zinc-500 block text-[10px] uppercase">Variação</span>
              <span className={`font-bold text-sm ${configTipo.corSinal}`}>
                {configTipo.sinal} {formatarQuantidade(movimentacao.quantidade)}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block text-[10px] uppercase">Saldo Posterior</span>
              <span className="text-zinc-100 font-bold text-sm">
                {formatarQuantidade(movimentacao.saldo_posterior)} {movimentacao.produto_unidade || ''}
              </span>
            </div>
          </div>

          {/* Rastreabilidade e Justificativas */}
          <div className="space-y-3 pt-1 border-t border-zinc-800/60">
            {movimentacao.motivo_destino && (
              <div className="p-2.5 bg-zinc-950/60 border border-zinc-800 rounded">
                <span className="text-zinc-500 font-mono block text-[10px] uppercase mb-0.5">
                  Motivo / Destino da Operação
                </span>
                <p className="text-zinc-200 font-medium">{movimentacao.motivo_destino}</p>
              </div>
            )}

            {movimentacao.justificativa && (
              <div className="p-2.5 bg-zinc-950/60 border border-zinc-800 rounded">
                <span className="text-zinc-500 font-mono block text-[10px] uppercase mb-0.5">
                  Justificativa de Ajuste
                </span>
                <p className="text-zinc-200 font-medium">{movimentacao.justificativa}</p>
              </div>
            )}

            {movimentacao.documento_ref && (
              <div className="p-2.5 bg-zinc-950/60 border border-zinc-800 rounded">
                <span className="text-zinc-500 font-mono block text-[10px] uppercase mb-0.5">
                  Documento de Referência
                </span>
                <p className="text-zinc-300 font-mono font-semibold">{movimentacao.documento_ref}</p>
              </div>
            )}

            {movimentacao.observacao && (
              <div className="p-2.5 bg-zinc-950/60 border border-zinc-800 rounded">
                <span className="text-zinc-500 font-mono block text-[10px] uppercase mb-0.5">
                  Observações Gerais
                </span>
                <p className="text-zinc-400 italic">{movimentacao.observacao}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2 text-[11px] font-mono text-zinc-400">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-zinc-500" />
                <span>{formatarDataHora(movimentacao.criado_em)}</span>
              </div>
              <div className="flex items-center gap-1.5 justify-end">
                <User className="w-3.5 h-3.5 text-zinc-500" />
                <span>{movimentacao.usuario_nome || 'Usuário do Sistema'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé Imutável */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 bg-zinc-950/50">
          <span className="text-[11px] font-mono text-zinc-500">
            Registro protegido por triggers e RLS (somente leitura)
          </span>
          <button
            type="button"
            onClick={aoFechar}
            className="px-4 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
