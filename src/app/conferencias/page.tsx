'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { stockService } from '@/services/stock-service';
import { productService } from '@/services/product-service';
import { ConferenciaFisica, Produto, ResultadoOperacaoEstoque } from '@/types/stock';
import { formatarQuantidade, formatarDataHora } from '@/lib/utils/formatters';
import { ConferenciaFormModal } from '@/components/modules/conferencias/conferencia-form-modal';
import { useAuth } from '@/contexts/auth-context';
import { 
  ClipboardCheck, 
  RefreshCw, 
  Search, 
  AlertCircle, 
  CheckCircle2, 
  Layers, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Plus,
  Filter,
  X
} from 'lucide-react';

export default function ConferenciasPage() {
  const { usuario } = useAuth();
  const podeAuditar = !!usuario && usuario.ativo && usuario.papel !== 'CONSULTA';

  const [conferencias, setConferencias] = useState<ConferenciaFisica[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);

  // Filtros
  const [termoBusca, setTermoBusca] = useState('');
  const [apenasDivergencias, setApenasDivergencias] = useState(false);

  // Modal de Conferência
  const [modalConferenciaAberto, setModalConferenciaAberto] = useState(false);
  const [produtoParaConferencia, setProdutoParaConferencia] = useState<Produto | null>(null);

  async function carregarDados() {
    setCarregando(true);
    setErro(null);
    try {
      const [listaConferencias, listaProdutos] = await Promise.all([
        stockService.listarConferencias({ limite: 100 }),
        productService.listar({ apenas_ativos: true }),
      ]);
      setConferencias(listaConferencias);
      setProdutos(listaProdutos);
    } catch (err: any) {
      setErro(err.message || 'Falha ao listar conferências físicas.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarDados();
  }, []);

  // Filtro em memória
  const conferenciasFiltradas = useMemo(() => {
    return conferencias.filter((c) => {
      if (apenasDivergencias && c.diferenca === 0) {
        return false;
      }
      if (termoBusca.trim() !== '') {
        const termo = termoBusca.toLowerCase();
        const nome = c.produto_nome?.toLowerCase() || '';
        const codigo = c.produto_codigo?.toLowerCase() || '';
        const lote = c.lote_numero?.toLowerCase() || '';
        const just = c.justificativa?.toLowerCase() || '';
        const resp = c.realizado_por_nome?.toLowerCase() || '';
        return (
          nome.includes(termo) ||
          codigo.includes(termo) ||
          lote.includes(termo) ||
          just.includes(termo) ||
          resp.includes(termo)
        );
      }
      return true;
    });
  }, [conferencias, termoBusca, apenasDivergencias]);

  // Callback de sucesso da conferência física
  async function handleSucessoConferencia(resultado: ResultadoOperacaoEstoque, produtoId: string) {
    setModalConferenciaAberto(false);
    setProdutoParaConferencia(null);

    try {
      const [produtoAtualizado, listaAtualizada] = await Promise.all([
        productService.buscarPorId(produtoId),
        stockService.listarConferencias({ limite: 100 }),
      ]);
      setConferencias(listaAtualizada);
      setMensagemSucesso(
        `Conferência física gravada com sucesso! Saldo oficial de "${produtoAtualizado.nome}": ${produtoAtualizado.saldo_atual} ${produtoAtualizado.unidade_medida}.`
      );
    } catch {
      await carregarDados();
      setMensagemSucesso('Conferência física gravada e histórico atualizado no banco.');
    }

    setTimeout(() => setMensagemSucesso(null), 5000);
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 uppercase tracking-widest">
            <ClipboardCheck className="w-4 h-4 text-amber-500" />
            <span>Auditoria de Inventário</span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-100 tracking-tight mt-1">
            Conferência Física de Estoque
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Registro da contagem real dos materiais, apuração de divergências e livro-razão imutável.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {podeAuditar && (
            <button
              onClick={() => {
                setProdutoParaConferencia(null);
                setModalConferenciaAberto(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-amber-600 hover:bg-amber-500 text-zinc-950 text-xs font-bold transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Conferência Física</span>
            </button>
          )}

          <button
            onClick={carregarDados}
            disabled={carregando}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-xs font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
            title="Recarregar histórico"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${carregando ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Banner de Sucesso */}
      {mensagemSucesso && (
        <div className="p-3 rounded-md bg-emerald-950/70 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium">{mensagemSucesso}</span>
        </div>
      )}

      {/* Barra de Filtros */}
      <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-lg space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
              placeholder="Buscar por material, código, lote ou responsável..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md pl-9 pr-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-amber-500 transition-colors placeholder:text-zinc-600"
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <label className="flex items-center gap-2 text-xs text-zinc-300 font-medium cursor-pointer select-none">
              <input
                type="checkbox"
                checked={apenasDivergencias}
                onChange={(e) => setApenasDivergencias(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-amber-500 focus:ring-offset-zinc-900"
              />
              <span>Apenas com divergência</span>
            </label>

            {(termoBusca || apenasDivergencias) && (
              <button
                onClick={() => {
                  setTermoBusca('');
                  setApenasDivergencias(false);
                }}
                className="text-amber-400 text-xs hover:underline inline-flex items-center gap-1 font-mono"
              >
                <X className="w-3.5 h-3.5" />
                Limpar
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-zinc-500 font-mono pt-1 border-t border-zinc-800/60">
          <span>{conferenciasFiltradas.length} conferência(s) registrada(s)</span>
          <span className="text-[11px] text-zinc-500">Histórico Imutável (Append-only)</span>
        </div>
      </div>

      {/* Tabela do Histórico de Conferências */}
      {carregando ? (
        <div className="border border-zinc-800 rounded-lg p-12 text-center bg-zinc-900/40">
          <RefreshCw className="w-6 h-6 text-amber-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-zinc-300 font-medium">Carregando histórico de auditorias...</p>
        </div>
      ) : erro ? (
        <div className="border border-red-900/60 rounded-lg p-6 bg-red-950/30 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
          <div>
            <h2 className="text-sm font-semibold text-red-300">Falha ao carregar conferências</h2>
            <p className="text-xs text-red-400/90 mt-1">{erro}</p>
          </div>
          <button
            onClick={carregarDados}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-900/60 hover:bg-red-900 text-xs font-medium text-red-200 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Tentar novamente</span>
          </button>
        </div>
      ) : conferenciasFiltradas.length === 0 ? (
        <div className="border border-zinc-800 border-dashed rounded-lg p-12 text-center bg-zinc-950/40 space-y-3">
          <ClipboardCheck className="w-8 h-8 text-zinc-600 mx-auto" />
          <h2 className="text-sm font-semibold text-zinc-200">Nenhuma conferência física encontrada</h2>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            {termoBusca || apenasDivergencias
              ? 'Nenhum registro corresponde aos filtros selecionados.'
              : 'Nenhuma conferência física foi realizada até o momento. Utilize o botão acima para iniciar a primeira contagem.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-zinc-800 rounded-lg bg-zinc-950/60 shadow-xs">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/70 text-zinc-400 font-mono text-xs uppercase tracking-wider">
                <th className="py-3 px-4">Data / Hora</th>
                <th className="py-3 px-4">Material</th>
                <th className="py-3 px-4">Lote Auditado</th>
                <th className="py-3 px-4 text-right">Anterior</th>
                <th className="py-3 px-4 text-right">Físico Encontrado</th>
                <th className="py-3 px-4 text-right">Diferença</th>
                <th className="py-3 px-4">Justificativa / Motivo</th>
                <th className="py-3 px-4">Responsável</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono text-xs">
              {conferenciasFiltradas.map((c) => (
                <tr key={c.id} className="hover:bg-zinc-900/50 transition-colors">
                  <td className="py-3 px-4 text-zinc-400 whitespace-nowrap">
                    {formatarDataHora(c.criado_em)}
                  </td>
                  <td className="py-3 px-4 font-sans">
                    <span className="font-mono text-amber-400 font-semibold block text-xs">
                      {c.produto_codigo || 'N/A'}
                    </span>
                    <span className="text-zinc-200 font-medium">{c.produto_nome || 'Produto sem nome'}</span>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    {c.lote_numero ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 text-amber-400 border border-zinc-700/80">
                        <Layers className="w-3 h-3 text-amber-400" />
                        {c.lote_numero}
                      </span>
                    ) : (
                      <span className="text-zinc-600 font-sans italic text-xs">Consolidado (sem lote)</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right text-zinc-400 font-bold">
                    {formatarQuantidade(c.quantidade_anterior)}
                  </td>
                  <td className="py-3 px-4 text-right text-zinc-100 font-bold text-sm">
                    {formatarQuantidade(c.quantidade_encontrada)}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded text-[11px] ${
                        c.diferenca === 0
                          ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/60'
                          : c.diferenca > 0
                          ? 'text-sky-400 bg-sky-950/60 border border-sky-800/60'
                          : 'text-amber-400 bg-amber-950/60 border border-amber-800/60'
                      }`}
                    >
                      {c.diferenca === 0 ? (
                        <>
                          <Minus className="w-3 h-3" />
                          0.000
                        </>
                      ) : c.diferenca > 0 ? (
                        <>
                          <TrendingUp className="w-3 h-3" />
                          +{formatarQuantidade(c.diferenca)}
                        </>
                      ) : (
                        <>
                          <TrendingDown className="w-3 h-3" />
                          {formatarQuantidade(c.diferenca)}
                        </>
                      )}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-sans text-xs text-zinc-300 max-w-xs truncate" title={c.justificativa || ''}>
                    {c.justificativa || <span className="text-zinc-600 italic">Sem divergência</span>}
                  </td>
                  <td className="py-3 px-4 font-sans text-xs text-zinc-400 whitespace-nowrap">
                    {c.realizado_por_nome || 'Usuário do Sistema'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de Conferência Física */}
      {modalConferenciaAberto && (
        <ConferenciaFormModal
          produtoInicial={produtoParaConferencia}
          produtosDisponiveis={produtos}
          aoSalvarSucesso={handleSucessoConferencia}
          aoFechar={() => {
            setModalConferenciaAberto(false);
            setProdutoParaConferencia(null);
          }}
        />
      )}
    </div>
  );
}
