'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { productService } from '@/services/product-service';
import { Produto, CategoriaProduto, SituacaoEstoque, ResultadoOperacaoEstoque } from '@/types/stock';
import { calcularSituacaoEstoque } from '@/lib/utils/formatters';
import { FiltrosEstoque } from '@/components/modules/estoque/filtros-estoque';
import { TabelaEstoque } from '@/components/modules/estoque/tabela-estoque';
import { DetalheProdutoModal } from '@/components/modules/estoque/detalhe-produto-modal';
import { EntradaFormModal } from '@/components/modules/estoque/entrada-form-modal';
import { SaidaFormModal } from '@/components/modules/estoque/saida-form-modal';
import { ConferenciaFormModal } from '@/components/modules/conferencias/conferencia-form-modal';
import { useAuth } from '@/contexts/auth-context';
import { 
  Boxes, 
  AlertCircle, 
  RefreshCw, 
  Layers, 
  ArrowDownLeft, 
  ArrowUpRight,
  ClipboardCheck,
  CheckCircle2 
} from 'lucide-react';

export default function EstoquePage() {
  const { usuario, autenticado, carregando: carregandoAuth } = useAuth();
  const podeMovimentar = !!usuario && usuario.ativo && usuario.papel !== 'CONSULTA';

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);

  // Estados dos Filtros
  const [termoBusca, setTermoBusca] = useState('');
  const [categoria, setCategoria] = useState<CategoriaProduto | 'TODAS'>('TODAS');
  const [situacao, setSituacao] = useState<SituacaoEstoque | 'TODAS'>('TODAS');
  const [apenasAtivos, setApenasAtivos] = useState(true);

  // Modais Operacionais
  const [produtoSelecionado, setProdutoSelecionado] = useState<Produto | null>(null);
  const [modalEntradaAberto, setModalEntradaAberto] = useState(false);
  const [produtoParaEntrada, setProdutoParaEntrada] = useState<Produto | null>(null);
  const [modalSaidaAberto, setModalSaidaAberto] = useState(false);
  const [produtoParaSaida, setProdutoParaSaida] = useState<Produto | null>(null);
  const [modalConferenciaAberto, setModalConferenciaAberto] = useState(false);
  const [produtoParaConferencia, setProdutoParaConferencia] = useState<Produto | null>(null);

  async function carregarProdutos() {
    setCarregando(true);
    setErro(null);
    try {
      const lista = await productService.listar({
        apenas_ativos: apenasAtivos,
        categoria: categoria !== 'TODAS' ? categoria : undefined,
        termo: termoBusca.trim() !== '' ? termoBusca : undefined,
      });
      setProdutos(lista);
    } catch (err: any) {
      setErro(err.message || 'Falha ao carregar posição de estoque.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    if (!carregandoAuth && autenticado) {
      carregarProdutos();
    }
  }, [categoria, apenasAtivos, carregandoAuth, autenticado]);

  // Lista processada e filtrada com cálculo determinístico de situação
  const itensComSituacao = useMemo(() => {
    return produtos
      .map((p) => ({
        produto: p,
        situacao: calcularSituacaoEstoque(p.saldo_atual, p.estoque_minimo, p.estoque_maximo),
      }))
      .filter((item) => {
        if (termoBusca.trim() !== '') {
          const t = termoBusca.toLowerCase();
          const matchNome = item.produto.nome.toLowerCase().includes(t);
          const matchCodigo = item.produto.codigo.toLowerCase().includes(t);
          if (!matchNome && !matchCodigo) return false;
        }

        if (situacao !== 'TODAS' && item.situacao !== situacao) {
          return false;
        }

        return true;
      });
  }, [produtos, termoBusca, situacao]);

  function handleLimparFiltros() {
    setTermoBusca('');
    setCategoria('TODAS');
    setSituacao('TODAS');
    setApenasAtivos(true);
  }

  // Callback acionado após sucesso da RPC registrar_entrada
  async function handleSucessoEntrada(resultado: ResultadoOperacaoEstoque, produtoId: string) {
    setModalEntradaAberto(false);
    setProdutoParaEntrada(null);

    // Consulta novamente o produto do banco para obter o saldo real atualizado
    try {
      const produtoAtualizado = await productService.buscarPorId(produtoId);
      setProdutos((prev) =>
        prev.map((p) => (p.id === produtoAtualizado.id ? produtoAtualizado : p))
      );
      setMensagemSucesso(
        `Entrada registrada com sucesso! Novo saldo do produto: ${produtoAtualizado.saldo_atual} ${produtoAtualizado.unidade_medida}.`
      );
    } catch {
      await carregarProdutos();
      setMensagemSucesso('Entrada confirmada e saldo atualizado no banco.');
    }

    setTimeout(() => setMensagemSucesso(null), 5000);
  }

  // Callback acionado após sucesso da RPC registrar_saida
  async function handleSucessoSaida(resultado: ResultadoOperacaoEstoque, produtoId: string) {
    setModalSaidaAberto(false);
    setProdutoParaSaida(null);

    // Consulta novamente o produto do banco para obter o saldo real atualizado
    try {
      const produtoAtualizado = await productService.buscarPorId(produtoId);
      setProdutos((prev) =>
        prev.map((p) => (p.id === produtoAtualizado.id ? produtoAtualizado : p))
      );
      setMensagemSucesso(
        `Saída registrada com sucesso! Novo saldo do produto: ${produtoAtualizado.saldo_atual} ${produtoAtualizado.unidade_medida}.`
      );
    } catch {
      await carregarProdutos();
      setMensagemSucesso('Saída confirmada e estoque atualizado no banco.');
    }

    setTimeout(() => setMensagemSucesso(null), 5000);
  }

  // Callback acionado após sucesso da RPC registrar_conferencia_fisica
  async function handleSucessoConferencia(resultado: ResultadoOperacaoEstoque, produtoId: string) {
    setModalConferenciaAberto(false);
    setProdutoParaConferencia(null);

    try {
      const produtoAtualizado = await productService.buscarPorId(produtoId);
      setProdutos((prev) =>
        prev.map((p) => (p.id === produtoAtualizado.id ? produtoAtualizado : p))
      );
      setMensagemSucesso(
        `Conferência física registrada com sucesso! Saldo oficial atualizado: ${produtoAtualizado.saldo_atual} ${produtoAtualizado.unidade_medida}.`
      );
    } catch {
      await carregarProdutos();
      setMensagemSucesso('Conferência física gravada no banco.');
    }

    setTimeout(() => setMensagemSucesso(null), 5000);
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Página com Ações Operacionais */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 uppercase tracking-widest">
            <Boxes className="w-4 h-4 text-amber-500" />
            <span>Posição de Estoque</span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-100 tracking-tight mt-1">
            Controle de Materiais
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Saldos em tempo real, níveis de estoque mínimo e rastreabilidade por lotes.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {podeMovimentar && (
            <>
              <button
                onClick={() => {
                  setProdutoParaEntrada(null);
                  setModalEntradaAberto(true);
                }}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-zinc-100 text-xs font-semibold transition-colors shadow-xs cursor-pointer"
              >
                <ArrowDownLeft className="w-4 h-4" />
                <span>Registrar Entrada</span>
              </button>

              <button
                onClick={() => {
                  setProdutoParaSaida(null);
                  setModalSaidaAberto(true);
                }}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-amber-600 hover:bg-amber-500 text-zinc-950 text-xs font-bold transition-colors shadow-xs cursor-pointer"
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>Registrar Saída</span>
              </button>

              <button
                onClick={() => {
                  setProdutoParaConferencia(null);
                  setModalConferenciaAberto(true);
                }}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors shadow-xs border border-zinc-700 cursor-pointer"
                title="Realizar contagem e auditoria física de materiais"
              >
                <ClipboardCheck className="w-4 h-4 text-amber-400" />
                <span>Conferência Física</span>
              </button>
            </>
          )}

          <button
            onClick={carregarProdutos}
            disabled={carregando}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-xs font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
            title="Recarregar dados do estoque"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${carregando ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Notificação de Sucesso */}
      {mensagemSucesso && (
        <div className="p-3 rounded-md bg-emerald-950/70 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium">{mensagemSucesso}</span>
        </div>
      )}

      {/* Barra de Busca e Filtros */}
      <FiltrosEstoque
        termo={termoBusca}
        onTermoChange={setTermoBusca}
        categoriaSelecionada={categoria}
        onCategoriaChange={setCategoria}
        situacaoSelecionada={situacao}
        onSituacaoChange={setSituacao}
        apenasAtivos={apenasAtivos}
        onApenasAtivosChange={setApenasAtivos}
        onLimparFiltros={handleLimparFiltros}
        totalResultados={itensComSituacao.length}
      />

      {/* Estados da Interface */}
      {carregando ? (
        <div className="border border-zinc-800 rounded-lg p-12 text-center bg-zinc-900/40">
          <RefreshCw className="w-6 h-6 text-amber-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-zinc-300 font-medium">Carregando posição de estoque...</p>
          <p className="text-xs text-zinc-500 mt-1 font-mono">Consultando catálogo e saldos consolidados</p>
        </div>
      ) : erro ? (
        <div className="border border-red-900/60 rounded-lg p-6 bg-red-950/30 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
          <div>
            <h2 className="text-sm font-semibold text-red-300">Falha ao carregar dados</h2>
            <p className="text-xs text-red-400/90 mt-1">{erro}</p>
          </div>
          <button
            onClick={carregarProdutos}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-900/60 hover:bg-red-900 text-xs font-medium text-red-200 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Tentar novamente</span>
          </button>
        </div>
      ) : itensComSituacao.length === 0 ? (
        <div className="border border-zinc-800 border-dashed rounded-lg p-12 text-center bg-zinc-950/40">
          <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 mx-auto mb-3">
            <Layers className="w-5 h-5" />
          </div>
          <h2 className="text-sm font-semibold text-zinc-200">Nenhum material encontrado</h2>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
            Nenhum registro corresponde aos filtros selecionados ou ainda não há materiais cadastrados no estoque.
          </p>
          {(termoBusca !== '' || categoria !== 'TODAS' || situacao !== 'TODAS') && (
            <button
              onClick={handleLimparFiltros}
              className="mt-4 px-3.5 py-1.5 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition-colors"
            >
              Limpar filtros aplicados
            </button>
          )}
        </div>
      ) : (
        /* Listagem de Estoque */
        <TabelaEstoque
          itens={itensComSituacao}
          onSelecionarProduto={(p) => setProdutoSelecionado(p)}
          podeMovimentar={podeMovimentar}
          onRegistrarEntrada={(p) => {
            setProdutoParaEntrada(p);
            setModalEntradaAberto(true);
          }}
          onRegistrarSaida={(p) => {
            setProdutoParaSaida(p);
            setModalSaidaAberto(true);
          }}
          onRealizarConferencia={(p) => {
            setProdutoParaConferencia(p);
            setModalConferenciaAberto(true);
          }}
        />
      )}

      {/* Modal de Detalhes do Produto */}
      {produtoSelecionado && (
        <DetalheProdutoModal
          produto={produtoSelecionado}
          situacao={calcularSituacaoEstoque(
            produtoSelecionado.saldo_atual,
            produtoSelecionado.estoque_minimo,
            produtoSelecionado.estoque_maximo
          )}
          aoFechar={() => setProdutoSelecionado(null)}
        />
      )}

      {/* Modal de Entrada de Estoque */}
      {modalEntradaAberto && (
        <EntradaFormModal
          produtoInicial={produtoParaEntrada}
          produtosDisponiveis={produtos}
          aoSalvarSucesso={handleSucessoEntrada}
          aoFechar={() => {
            setModalEntradaAberto(false);
            setProdutoParaEntrada(null);
          }}
        />
      )}

      {/* Modal de Saída de Estoque */}
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

      {/* Modal de Conferência Física de Estoque */}
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
