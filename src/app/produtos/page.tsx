'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { productService } from '@/services/product-service';
import { Produto, CategoriaProduto, CATEGORIAS_VALIDAS } from '@/types/stock';
import { formatarQuantidade } from '@/lib/utils/formatters';
import { ProdutoFormModal } from '@/components/modules/produtos/produto-form-modal';
import { EntradaFormModal } from '@/components/modules/estoque/entrada-form-modal';
import { SaidaFormModal } from '@/components/modules/estoque/saida-form-modal';
import { useAuth } from '@/contexts/auth-context';
import { 
  Layers, 
  Plus, 
  Search, 
  RefreshCw, 
  Edit3, 
  Power, 
  AlertCircle, 
  CheckCircle2, 
  ArrowDownLeft,
  ArrowUpRight,
  X
} from 'lucide-react';

export default function ProdutosPage() {
  const { usuario, autenticado, carregando: carregandoAuth } = useAuth();
  const podeGerenciar = !!usuario && usuario.ativo && (usuario.papel === 'ADMIN' || usuario.papel === 'OPERADOR');
  const podeMovimentar = !!usuario && usuario.ativo && usuario.papel !== 'CONSULTA';


  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);

  // Estados dos Filtros
  const [termoBusca, setTermoBusca] = useState('');
  const [categoria, setCategoria] = useState<CategoriaProduto | 'TODAS'>('TODAS');
  const [filtroStatus, setFiltroStatus] = useState<'TODOS' | 'ATIVOS' | 'INATIVOS'>('TODOS');

  // Estados do Modal
  const [modalAberto, setModalAberto] = useState(false);
  const [produtoEmEdicao, setProdutoEmEdicao] = useState<Produto | null>(null);
  const [modalEntradaAberto, setModalEntradaAberto] = useState(false);
  const [produtoParaEntrada, setProdutoParaEntrada] = useState<Produto | null>(null);
  const [modalSaidaAberto, setModalSaidaAberto] = useState(false);
  const [produtoParaSaida, setProdutoParaSaida] = useState<Produto | null>(null);
  const [alternandoStatusId, setAlternandoStatusId] = useState<string | null>(null);

  // Modal Interno de Confirmação de Desativação/Ativação
  const [produtoParaAlternarStatus, setProdutoParaAlternarStatus] = useState<Produto | null>(null);

  async function carregarProdutos() {
    setCarregando(true);
    setErro(null);
    try {
      const lista = await productService.listar({
        apenas_ativos: false, // Carrega todos para permitir gestão de inativos
      });
      setProdutos(lista);
    } catch (err: any) {
      setErro(err.message || 'Falha ao listar catálogo de produtos.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    if (!carregandoAuth && autenticado) {
      carregarProdutos();
    }
  }, [carregandoAuth, autenticado]);

  // Filtragem dinâmica em memória
  const produtosFiltrados = useMemo(() => {
    return produtos.filter((p) => {
      // Filtro por termo (nome ou código)
      if (termoBusca.trim() !== '') {
        const t = termoBusca.toLowerCase();
        const matchNome = p.nome.toLowerCase().includes(t);
        const matchCodigo = p.codigo.toLowerCase().includes(t);
        if (!matchNome && !matchCodigo) return false;
      }

      // Filtro por categoria
      if (categoria !== 'TODAS' && p.categoria !== categoria) {
        return false;
      }

      // Filtro por status ativo/inativo
      if (filtroStatus === 'ATIVOS' && !p.ativo) return false;
      if (filtroStatus === 'INATIVOS' && p.ativo) return false;

      return true;
    });
  }, [produtos, termoBusca, categoria, filtroStatus]);

  async function handleConfirmarAlternarStatus() {
    if (!produtoParaAlternarStatus) return;
    const produto = produtoParaAlternarStatus;
    const novoStatus = !produto.ativo;

    setAlternandoStatusId(produto.id);
    setErro(null);
    try {
      const atualizado = await productService.alternarStatus(produto.id, novoStatus);
      setProdutos((prev) => prev.map((p) => (p.id === atualizado.id ? atualizado : p)));
      setMensagemSucesso(`Material "${produto.nome}" ${novoStatus ? 'ativado' : 'desativado'} com sucesso.`);
      setTimeout(() => setMensagemSucesso(null), 4000);
      setProdutoParaAlternarStatus(null);
    } catch (err: any) {
      setErro(err.message || 'Erro ao alterar status do produto.');
    } finally {
      setAlternandoStatusId(null);
    }
  }

  function handleSalvarSucesso(produtoSalvo: Produto) {
    setProdutos((prev) => {
      const existe = prev.some((p) => p.id === produtoSalvo.id);
      if (existe) {
        return prev.map((p) => (p.id === produtoSalvo.id ? produtoSalvo : p));
      }
      return [produtoSalvo, ...prev];
    });
    setModalAberto(false);
    setProdutoEmEdicao(null);
    setMensagemSucesso(`Material "${produtoSalvo.nome}" salvo com sucesso.`);
    setTimeout(() => setMensagemSucesso(null), 4000);
  }

  // Callback de sucesso ao registrar entrada pela lista de produtos
  async function handleSucessoEntrada(resultado: any, produtoId: string) {
    setModalEntradaAberto(false);
    setProdutoParaEntrada(null);
    try {
      const atualizado = await productService.buscarPorId(produtoId);
      setProdutos((prev) => prev.map((p) => (p.id === atualizado.id ? atualizado : p)));
      setMensagemSucesso(`Entrada registrada com sucesso! Novo saldo de "${atualizado.nome}": ${atualizado.saldo_atual} ${atualizado.unidade_medida}.`);
    } catch {
      await carregarProdutos();
      setMensagemSucesso('Entrada registrada com sucesso.');
    }
    setTimeout(() => setMensagemSucesso(null), 5000);
  }

  // Callback de sucesso ao registrar saída pela lista de produtos
  async function handleSucessoSaida(resultado: any, produtoId: string) {
    setModalSaidaAberto(false);
    setProdutoParaSaida(null);
    try {
      const atualizado = await productService.buscarPorId(produtoId);
      setProdutos((prev) => prev.map((p) => (p.id === atualizado.id ? atualizado : p)));
      setMensagemSucesso(`Saída registrada com sucesso! Novo saldo de "${atualizado.nome}": ${atualizado.saldo_atual} ${atualizado.unidade_medida}.`);
    } catch {
      await carregarProdutos();
      setMensagemSucesso('Saída registrada com sucesso.');
    }
    setTimeout(() => setMensagemSucesso(null), 5000);
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 uppercase tracking-widest">
            <Layers className="w-4 h-4 text-amber-500" />
            <span>Catálogo de Materiais</span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-100 tracking-tight mt-1">
            Gestão de Produtos
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Cadastro, especificações técnicas, controle de lote e parametrização de estoque mínimo.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {podeGerenciar && (
            <button
              onClick={() => {
                setProdutoEmEdicao(null);
                setModalAberto(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-semibold transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Material</span>
            </button>
          )}
          <button
            onClick={carregarProdutos}
            disabled={carregando}
            className="p-2 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors disabled:opacity-50"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Alertas de Notificação */}
      {mensagemSucesso && (
        <div className="p-3 rounded-md bg-emerald-950/60 border border-emerald-900/80 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{mensagemSucesso}</span>
        </div>
      )}
      {erro && (
        <div className="p-3 rounded-md bg-red-950/60 border border-red-900/80 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      {/* Barra de Busca e Filtros */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 sm:p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Busca por Texto */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por código ou nome do produto..."
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          {/* Filtro por Categoria */}
          <div className="w-full md:w-56">
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as CategoriaProduto | 'TODAS')}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-amber-500 transition-colors"
            >
              <option value="TODAS">Todas as Categorias</option>
              {CATEGORIAS_VALIDAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro por Status */}
          <div className="w-full md:w-44">
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value as 'TODOS' | 'ATIVOS' | 'INATIVOS')}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-amber-500 transition-colors"
            >
              <option value="TODOS">Status: Todos</option>
              <option value="ATIVOS">Apenas Ativos</option>
              <option value="INATIVOS">Apenas Inativos</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-zinc-500 font-mono pt-1">
          <span>{produtosFiltrados.length} materiais cadastrados</span>
          {(termoBusca || categoria !== 'TODAS' || filtroStatus !== 'TODOS') && (
            <button
              onClick={() => {
                setTermoBusca('');
                setCategoria('TODAS');
                setFiltroStatus('TODOS');
              }}
              className="text-amber-400 hover:underline inline-flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Tabela de Produtos */}
      {carregando ? (
        <div className="border border-zinc-800 rounded-lg p-12 text-center bg-zinc-900/40">
          <RefreshCw className="w-6 h-6 text-amber-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-zinc-300 font-medium">Carregando cadastro de materiais...</p>
        </div>
      ) : produtosFiltrados.length === 0 ? (
        <div className="border border-zinc-800 border-dashed rounded-lg p-12 text-center bg-zinc-950/40">
          <Layers className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <h2 className="text-sm font-semibold text-zinc-200">Nenhum material localizado</h2>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
            Nenhum produto cadastrado corresponde aos critérios ou ainda não foram adicionados materiais.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-zinc-800 rounded-lg bg-zinc-950/60 shadow-xs">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/70 text-zinc-400 font-mono text-xs uppercase tracking-wider">
                <th className="py-3 px-4">Código</th>
                <th className="py-3 px-4">Nome</th>
                <th className="py-3 px-4">Categoria</th>
                <th className="py-3 px-4 text-center">Unidade</th>
                <th className="py-3 px-4 text-right">Est. Mínimo</th>
                <th className="py-3 px-4 text-right">Saldo Atual</th>
                <th className="py-3 px-4 text-center">Lotes</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {produtosFiltrados.map((p) => (
                <tr 
                  key={p.id} 
                  className={`transition-colors ${
                    p.ativo 
                      ? 'hover:bg-zinc-900/50' 
                      : 'bg-zinc-950/40 opacity-65 hover:opacity-100 hover:bg-zinc-900/30'
                  }`}
                >
                  <td className="py-3 px-4 font-mono text-xs font-semibold text-amber-400/90 whitespace-nowrap">
                    {p.codigo}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-zinc-200">{p.nome}</div>
                    {p.fabricante && (
                      <div className="text-[11px] text-zinc-500 font-mono">
                        Fabricante: {p.fabricante}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-xs text-zinc-400">
                    <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700/60">
                      {p.categoria}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center font-mono text-xs text-zinc-300">
                    {p.unidade_medida}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs text-zinc-400">
                    {formatarQuantidade(p.estoque_minimo)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-zinc-100">
                    {formatarQuantidade(p.saldo_atual)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {p.controla_lote ? (
                      <span className="text-[11px] font-mono text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded">
                        Sim
                      </span>
                    ) : (
                      <span className="text-zinc-600 text-xs font-mono">Não</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium uppercase font-mono ${
                        p.ativo
                          ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/80'
                          : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                      }`}
                    >
                      {p.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                    {p.ativo && podeMovimentar && (
                      <>
                        <button
                          onClick={() => {
                            setProdutoParaEntrada(p);
                            setModalEntradaAberto(true);
                          }}
                          className="p-1.5 rounded hover:bg-emerald-950/40 text-zinc-400 hover:text-emerald-400 transition-colors cursor-pointer"
                          title="Registrar entrada de estoque para este material"
                          aria-label={`Entrada ${p.nome}`}
                        >
                          <ArrowDownLeft className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setProdutoParaSaida(p);
                            setModalSaidaAberto(true);
                          }}
                          className="p-1.5 rounded hover:bg-amber-950/40 text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer"
                          title="Registrar saída de estoque para este material"
                          aria-label={`Saída ${p.nome}`}
                        >
                          <ArrowUpRight className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {podeGerenciar && (
                      <>
                        <button
                          onClick={() => {
                            setProdutoEmEdicao(p);
                            setModalAberto(true);
                          }}
                          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer"
                          title="Editar dados cadastrais"
                          aria-label={`Editar ${p.nome}`}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setProdutoParaAlternarStatus(p)}
                          disabled={alternandoStatusId === p.id}
                          className={`p-1.5 rounded hover:bg-zinc-800 transition-colors cursor-pointer ${
                            p.ativo
                              ? 'text-zinc-400 hover:text-red-400'
                              : 'text-zinc-400 hover:text-emerald-400'
                          }`}
                          title={p.ativo ? 'Desativar material' : 'Reativar material'}
                          aria-label={p.ativo ? `Desativar ${p.nome}` : `Reativar ${p.nome}`}
                        >
                          <Power className={`w-4 h-4 ${alternandoStatusId === p.id ? 'animate-spin' : ''}`} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de Cadastro / Edição */}
      {modalAberto && (
        <ProdutoFormModal
          produtoParaEditar={produtoEmEdicao}
          aoSalvarSucesso={handleSalvarSucesso}
          aoFechar={() => {
            setModalAberto(false);
            setProdutoEmEdicao(null);
          }}
        />
      )}

      {/* Modal de Entrada Rápida de Estoque */}
      {modalEntradaAberto && (
        <EntradaFormModal
          produtoInicial={produtoParaEntrada}
          produtosDisponiveis={produtos}
          aoSalvarSucesso={async (_resultado, produtoId) => {
            setModalEntradaAberto(false);
            setProdutoParaEntrada(null);
            try {
              const atualizado = await productService.buscarPorId(produtoId);
              setProdutos((prev) =>
                prev.map((p) => (p.id === atualizado.id ? atualizado : p))
              );
              setMensagemSucesso(
                `Entrada registrada com sucesso! Novo saldo: ${atualizado.saldo_atual} ${atualizado.unidade_medida}.`
              );
            } catch {
              await carregarProdutos();
            }
            setTimeout(() => setMensagemSucesso(null), 4000);
          }}
          aoFechar={() => {
            setModalEntradaAberto(false);
            setProdutoParaEntrada(null);
          }}
        />
      )}

      {/* Modal de Saída Rápida de Estoque */}
      {modalSaidaAberto && (
        <SaidaFormModal
          produtoInicial={produtoParaSaida}
          produtosDisponiveis={produtos}
          aoSalvarSucesso={handleSucessoSaida}
          aoFechar={() => {
            setModalSaidaAberto(false);
            setProdutoParaSaida(null);
          }}
        />
      )}

      {/* Modal Interno de Confirmação de Ativação / Desativação de Material */}
      {produtoParaAlternarStatus && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget && !alternandoStatusId) {
              setProdutoParaAlternarStatus(null);
            }
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                produtoParaAlternarStatus.ativo 
                  ? 'bg-rose-950/80 border border-rose-800 text-rose-400' 
                  : 'bg-emerald-950/80 border border-emerald-800 text-emerald-400'
              }`}>
                <Power className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-zinc-100 text-sm">
                  {produtoParaAlternarStatus.ativo ? 'Confirmar Desativação' : 'Confirmar Reativação'}
                </h3>
                <span className="font-mono text-xs text-amber-400">
                  {produtoParaAlternarStatus.codigo} — {produtoParaAlternarStatus.nome}
                </span>
              </div>
            </div>

            <div className="p-3 bg-zinc-950/70 border border-zinc-800/80 rounded-lg text-xs text-zinc-300 space-y-2">
              {produtoParaAlternarStatus.ativo ? (
                <>
                  <p className="leading-relaxed">
                    Ao desativar este material, novas operações de <strong>Entrada, Saída e Conferência Física serão bloqueadas</strong>.
                  </p>
                  <p className="text-zinc-400 text-[11px] leading-relaxed border-t border-zinc-800/60 pt-2 font-mono">
                    ✓ O saldo existente de <strong>{formatarQuantidade(produtoParaAlternarStatus.saldo_atual)} {produtoParaAlternarStatus.unidade_medida}</strong> será mantido intacto.<br/>
                    ✓ Todo o histórico no livro-razão continuará preservado.<br/>
                    ✓ Não existe exclusão física de registros.
                  </p>
                </>
              ) : (
                <p className="leading-relaxed">
                  Ao reativar este material, ele voltará a estar disponível para movimentações operacionais de estoque e conferências no almoxarifado.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={Boolean(alternandoStatusId)}
                onClick={() => setProdutoParaAlternarStatus(null)}
                className="px-4 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={Boolean(alternandoStatusId)}
                onClick={handleConfirmarAlternarStatus}
                className={`px-4 py-2 rounded-md text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  produtoParaAlternarStatus.ativo
                    ? 'bg-rose-700 hover:bg-rose-600 text-zinc-100'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-zinc-100'
                }`}
              >
                {alternandoStatusId ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processando...</span>
                  </>
                ) : (
                  <span>
                    {produtoParaAlternarStatus.ativo ? 'Confirmar Desativação' : 'Confirmar Reativação'}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
