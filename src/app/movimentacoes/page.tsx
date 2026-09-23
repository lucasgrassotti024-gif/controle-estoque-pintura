'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { stockService } from '@/services/stock-service';
import { Movimentacao, TipoMovimentacao } from '@/types/stock';
import { formatarQuantidade, formatarDataHora } from '@/lib/utils/formatters';
import { DetalheMovimentacaoModal } from '@/components/modules/movimentacoes/detalhe-movimentacao-modal';
import { 
  ArrowLeftRight, 
  RefreshCw, 
  Search, 
  Filter, 
  ArrowDownLeft, 
  ArrowUpRight, 
  TrendingUp, 
  TrendingDown, 
  Layers, 
  AlertCircle, 
  Calendar, 
  ChevronRight,
  ChevronLeft,
  X,
  FileText
} from 'lucide-react';

const ITENS_POR_PAGINA = 25;

export default function MovimentacoesPage() {
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Filtros
  const [termoBusca, setTermoBusca] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<TipoMovimentacao | 'TODOS'>('TODOS');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  // Paginação no cliente com dados trazidos em batches seguros
  const [paginaAtual, setPaginaAtual] = useState(1);

  // Modal de Detalhe
  const [movimentacaoSelecionada, setMovimentacaoSelecionada] = useState<Movimentacao | null>(null);

  async function carregarMovimentacoes() {
    setCarregando(true);
    setErro(null);
    try {
      // Carrega limite seguro de até 200 registros mais recentes do banco
      const lista = await stockService.listarMovimentacoes({
        tipo: tipoFiltro !== 'TODOS' ? tipoFiltro : undefined,
        data_inicio: dataInicio ? `${dataInicio}T00:00:00Z` : undefined,
        data_fim: dataFim ? `${dataFim}T23:59:59Z` : undefined,
        limite: 200,
      });
      setMovimentacoes(lista);
      setPaginaAtual(1);
    } catch (err: any) {
      setErro(err.message || 'Falha ao carregar histórico de movimentações.');
    } finally {
      setCarregando(false);
    }
  }

  // Recarrega quando filtros de servidor mudam
  useEffect(() => {
    carregarMovimentacoes();
  }, [tipoFiltro, dataInicio, dataFim]);

  // Filtro textual operacional em memória (material, código, lote, doc_ref, motivo, usuário)
  const movimentacoesFiltradas = useMemo(() => {
    if (!termoBusca.trim()) return movimentacoes;
    const termo = termoBusca.toLowerCase();
    return movimentacoes.filter((m) => {
      const nome = m.produto_nome?.toLowerCase() || '';
      const codigo = m.produto_codigo?.toLowerCase() || '';
      const lote = m.lote_numero?.toLowerCase() || '';
      const doc = m.documento_ref?.toLowerCase() || '';
      const motivo = m.motivo_destino?.toLowerCase() || '';
      const just = m.justificativa?.toLowerCase() || '';
      const usuario = m.usuario_nome?.toLowerCase() || '';
      return (
        nome.includes(termo) ||
        codigo.includes(termo) ||
        lote.includes(termo) ||
        doc.includes(termo) ||
        motivo.includes(termo) ||
        just.includes(termo) ||
        usuario.includes(termo)
      );
    });
  }, [movimentacoes, termoBusca]);

  // Resumo Operacional da Amostra Carregada
  const resumoOperacional = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    let ajustesEntrada = 0;
    let ajustesSaida = 0;

    for (const m of movimentacoesFiltradas) {
      if (m.tipo === 'ENTRADA') entradas++;
      else if (m.tipo === 'SAIDA') saidas++;
      else if (m.tipo === 'AJUSTE_ENTRADA') ajustesEntrada++;
      else if (m.tipo === 'AJUSTE_SAIDA') ajustesSaida++;
    }

    return {
      total: movimentacoesFiltradas.length,
      entradas,
      saidas,
      ajustes: ajustesEntrada + ajustesSaida,
    };
  }, [movimentacoesFiltradas]);

  // Paginação
  const totalPaginas = Math.max(1, Math.ceil(movimentacoesFiltradas.length / ITENS_POR_PAGINA));
  const itensPaginados = useMemo(() => {
    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
    return movimentacoesFiltradas.slice(inicio, inicio + ITENS_POR_PAGINA);
  }, [movimentacoesFiltradas, paginaAtual]);

  function handleLimparFiltros() {
    setTermoBusca('');
    setTipoFiltro('TODOS');
    setDataInicio('');
    setDataFim('');
    setPaginaAtual(1);
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 uppercase tracking-widest">
            <ArrowLeftRight className="w-4 h-4 text-amber-500" />
            <span>Livro-Razão Transacional</span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-100 tracking-tight mt-1">
            Movimentações de Estoque
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Registro imutável de todas as entradas, saídas e ajustes de inventário.
          </p>
        </div>

        <button
          onClick={carregarMovimentacoes}
          disabled={carregando}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-xs font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer self-start sm:self-auto"
          title="Recarregar movimentações"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${carregando ? 'animate-spin' : ''}`} />
          <span>Atualizar</span>
        </button>
      </div>

      {/* Resumo Operacional dos Registros Carregados */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-lg">
          <span className="text-[10px] font-mono text-zinc-500 uppercase block">Total de Movimentos</span>
          <span className="font-mono text-lg font-bold text-zinc-100">{resumoOperacional.total}</span>
        </div>
        <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-lg">
          <span className="text-[10px] font-mono text-zinc-500 uppercase block">Entradas</span>
          <span className="font-mono text-lg font-bold text-emerald-400">+{resumoOperacional.entradas}</span>
        </div>
        <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-lg">
          <span className="text-[10px] font-mono text-zinc-500 uppercase block">Saídas</span>
          <span className="font-mono text-lg font-bold text-amber-400">-{resumoOperacional.saidas}</span>
        </div>
        <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-lg">
          <span className="text-[10px] font-mono text-zinc-500 uppercase block">Ajustes Físicos</span>
          <span className="font-mono text-lg font-bold text-sky-400">{resumoOperacional.ajustes}</span>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-lg space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
          {/* Campo de Busca Livre */}
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={termoBusca}
              onChange={(e) => {
                setTermoBusca(e.target.value);
                setPaginaAtual(1);
              }}
              placeholder="Buscar por material, código, lote, documento, motivo..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md pl-9 pr-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-amber-500 transition-colors placeholder:text-zinc-600"
            />
          </div>

          {/* Filtro por Tipo */}
          <div>
            <select
              value={tipoFiltro}
              onChange={(e) => setTipoFiltro(e.target.value as any)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-amber-500 transition-colors"
            >
              <option value="TODOS">Tipo: Todos</option>
              <option value="ENTRADA">Entradas</option>
              <option value="SAIDA">Saídas</option>
              <option value="AJUSTE_ENTRADA">Ajustes de Entrada (Sobra)</option>
              <option value="AJUSTE_SAIDA">Ajustes de Saída (Falta)</option>
            </select>
          </div>

          {/* Filtro por Período */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-amber-500 transition-colors font-mono"
              title="Data inicial"
            />
            <span className="text-zinc-600 text-xs font-mono">até</span>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-amber-500 transition-colors font-mono"
              title="Data final"
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-zinc-500 font-mono pt-1 border-t border-zinc-800/60">
          <span>{movimentacoesFiltradas.length} lançamento(s) correspondente(s)</span>
          {(termoBusca || tipoFiltro !== 'TODOS' || dataInicio || dataFim) && (
            <button
              onClick={handleLimparFiltros}
              className="text-amber-400 text-xs hover:underline inline-flex items-center gap-1 font-mono cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Listagem Transacional */}
      {carregando ? (
        <div className="border border-zinc-800 rounded-lg p-12 text-center bg-zinc-900/40">
          <RefreshCw className="w-6 h-6 text-amber-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-zinc-300 font-medium">Carregando livro-razão...</p>
        </div>
      ) : erro ? (
        <div className="border border-red-900/60 rounded-lg p-6 bg-red-950/30 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
          <div>
            <h2 className="text-sm font-semibold text-red-300">Falha ao consultar movimentações</h2>
            <p className="text-xs text-red-400/90 mt-1">{erro}</p>
          </div>
          <button
            onClick={carregarMovimentacoes}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-900/60 hover:bg-red-900 text-xs font-medium text-red-200 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Tentar novamente</span>
          </button>
        </div>
      ) : movimentacoesFiltradas.length === 0 ? (
        <div className="border border-zinc-800 border-dashed rounded-lg p-12 text-center bg-zinc-950/40 space-y-3">
          <ArrowLeftRight className="w-8 h-8 text-zinc-600 mx-auto" />
          <h2 className="text-sm font-semibold text-zinc-200">Nenhuma movimentação encontrada</h2>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            {termoBusca || tipoFiltro !== 'TODOS' || dataInicio || dataFim
              ? 'Não existem movimentações para os filtros selecionados.'
              : 'O livro-razão ainda não possui lançamentos registrados no sistema.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 1. Visão Desktop: Tabela de Alta Densidade */}
          <div className="hidden md:block overflow-x-auto border border-zinc-800 rounded-lg bg-zinc-950/60 shadow-xs">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/70 text-zinc-400 font-mono text-xs uppercase tracking-wider">
                  <th className="py-3 px-4">Data / Hora</th>
                  <th className="py-3 px-4">Material</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4 text-right">Quantidade</th>
                  <th className="py-3 px-4 text-right">Saldo Ant.</th>
                  <th className="py-3 px-4 text-right">Saldo Pós.</th>
                  <th className="py-3 px-4">Lote</th>
                  <th className="py-3 px-4">Destino / Ref</th>
                  <th className="py-3 px-4">Responsável</th>
                  <th className="py-3 px-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono text-xs">
                {itensPaginados.map((m) => {
                  const isEntrada = m.tipo === 'ENTRADA' || m.tipo === 'AJUSTE_ENTRADA';
                  return (
                    <tr
                      key={m.id}
                      onClick={() => setMovimentacaoSelecionada(m)}
                      className="hover:bg-zinc-900/50 cursor-pointer transition-colors group"
                    >
                      <td className="py-3 px-4 text-zinc-400 whitespace-nowrap">
                        {formatarDataHora(m.criado_em)}
                      </td>
                      <td className="py-3 px-4 font-sans">
                        <span className="font-mono text-amber-400 font-semibold block text-xs">
                          {m.produto_codigo || 'N/A'}
                        </span>
                        <span className="text-zinc-200 font-medium group-hover:text-amber-400 transition-colors">
                          {m.produto_nome || 'Produto sem nome'}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded text-[11px] ${
                            m.tipo === 'ENTRADA'
                              ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/60'
                              : m.tipo === 'SAIDA'
                              ? 'text-amber-400 bg-amber-950/60 border border-amber-800/60'
                              : m.tipo === 'AJUSTE_ENTRADA'
                              ? 'text-sky-400 bg-sky-950/60 border border-sky-800/60'
                              : 'text-rose-400 bg-rose-950/60 border border-rose-800/60'
                          }`}
                        >
                          {m.tipo === 'ENTRADA' && <ArrowDownLeft className="w-3 h-3" />}
                          {m.tipo === 'SAIDA' && <ArrowUpRight className="w-3 h-3" />}
                          {m.tipo === 'AJUSTE_ENTRADA' && <TrendingUp className="w-3 h-3" />}
                          {m.tipo === 'AJUSTE_SAIDA' && <TrendingDown className="w-3 h-3" />}
                          {m.tipo}
                        </span>
                      </td>
                      <td className={`py-3 px-4 text-right font-bold text-sm whitespace-nowrap ${isEntrada ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {isEntrada ? '+' : '-'} {formatarQuantidade(m.quantidade)} {m.produto_unidade || ''}
                      </td>
                      <td className="py-3 px-4 text-right text-zinc-500 whitespace-nowrap">
                        {formatarQuantidade(m.saldo_anterior)}
                      </td>
                      <td className="py-3 px-4 text-right text-zinc-200 font-bold whitespace-nowrap">
                        {formatarQuantidade(m.saldo_posterior)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {m.lote_numero ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 text-amber-400 border border-zinc-700/80">
                            <Layers className="w-3 h-3 text-amber-400" />
                            {m.lote_numero}
                          </span>
                        ) : (
                          <span className="text-zinc-600 font-sans italic text-xs">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-sans text-xs text-zinc-300 max-w-xs truncate" title={m.motivo_destino || m.documento_ref || ''}>
                        {m.motivo_destino || m.documento_ref || <span className="text-zinc-600 italic">Sem ref.</span>}
                      </td>
                      <td className="py-3 px-4 font-sans text-xs text-zinc-400 whitespace-nowrap">
                        {m.usuario_nome || 'Sistema'}
                      </td>
                      <td className="py-3 px-2 text-right text-zinc-600 group-hover:text-amber-400 transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 2. Visão Mobile / Tablet: Cards Operacionais de Toque Fácil */}
          <div className="md:hidden space-y-3">
            {itensPaginados.map((m) => {
              const isEntrada = m.tipo === 'ENTRADA' || m.tipo === 'AJUSTE_ENTRADA';
              return (
                <div
                  key={m.id}
                  onClick={() => setMovimentacaoSelecionada(m)}
                  className="p-3.5 rounded-lg bg-zinc-900/60 border border-zinc-800 active:bg-zinc-800/60 transition-colors cursor-pointer space-y-2.5 shadow-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-mono text-amber-400 font-semibold block">
                        {m.produto_codigo || 'N/A'}
                      </span>
                      <h3 className="text-sm font-semibold text-zinc-100 leading-tight">
                        {m.produto_nome || 'Produto sem nome'}
                      </h3>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded text-[10px] font-mono ${
                        m.tipo === 'ENTRADA'
                          ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/60'
                          : m.tipo === 'SAIDA'
                          ? 'text-amber-400 bg-amber-950/60 border border-amber-800/60'
                          : m.tipo === 'AJUSTE_ENTRADA'
                          ? 'text-sky-400 bg-sky-950/60 border border-sky-800/60'
                          : 'text-rose-400 bg-rose-950/60 border border-rose-800/60'
                      }`}
                    >
                      {m.tipo}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800/60 text-xs font-mono">
                    <div>
                      <span className="text-zinc-500 block uppercase text-[10px]">Variação</span>
                      <span className={`text-sm font-bold ${isEntrada ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {isEntrada ? '+' : '-'} {formatarQuantidade(m.quantidade)} {m.produto_unidade || ''}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block uppercase text-[10px]">Saldo Pós</span>
                      <span className="text-sm font-semibold text-zinc-200">
                        {formatarQuantidade(m.saldo_posterior)} {m.produto_unidade || ''}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 pt-1">
                    <span>{formatarDataHora(m.criado_em)}</span>
                    {m.lote_numero && (
                      <span className="text-amber-400 font-semibold">Lote: {m.lote_numero}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Paginação */}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between p-3 bg-zinc-900/60 border border-zinc-800 rounded-lg text-xs font-mono">
              <span className="text-zinc-400">
                Página {paginaAtual} de {totalPaginas} ({movimentacoesFiltradas.length} registros)
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
                  disabled={paginaAtual === 1}
                  className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Página anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPaginaAtual((p) => Math.min(totalPaginas, p + 1))}
                  disabled={paginaAtual === totalPaginas}
                  className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Próxima página"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal de Detalhe da Movimentação */}
      {movimentacaoSelecionada && (
        <DetalheMovimentacaoModal
          movimentacao={movimentacaoSelecionada}
          aoFechar={() => setMovimentacaoSelecionada(null)}
        />
      )}
    </div>
  );
}
