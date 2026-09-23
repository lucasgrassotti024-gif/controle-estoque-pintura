'use client';

import React, { useState, useEffect } from 'react';
import { 
  Produto, 
  CriarProdutoDTO, 
  AtualizarProdutoDTO, 
  CategoriaProduto, 
  UnidadeMedida,
  CATEGORIAS_VALIDAS,
  UNIDADES_VALIDAS
} from '@/types/stock';
import { productService } from '@/services/product-service';
import { formatarErroBanco } from '@/lib/utils/error-handler';
import { X, Save, Layers, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ProdutoFormModalProps {
  produtoParaEditar?: Produto | null;
  aoSalvarSucesso: (produto: Produto) => void;
  aoFechar: () => void;
}

export function ProdutoFormModal({
  produtoParaEditar,
  aoSalvarSucesso,
  aoFechar,
}: ProdutoFormModalProps) {
  const modoEdicao = Boolean(produtoParaEditar);

  // Estados dos Campos
  const [codigo, setCodigo] = useState(produtoParaEditar?.codigo || '');
  const [nome, setNome] = useState(produtoParaEditar?.nome || '');
  const [descricao, setDescricao] = useState(produtoParaEditar?.descricao || '');
  const [categoria, setCategoria] = useState<CategoriaProduto>(produtoParaEditar?.categoria || 'Tintas');
  const [unidadeMedida, setUnidadeMedida] = useState<UnidadeMedida>(produtoParaEditar?.unidade_medida || 'UN');
  const [fabricante, setFabricante] = useState(produtoParaEditar?.fabricante || '');
  const [localizacao, setLocalizacao] = useState(produtoParaEditar?.localizacao || '');
  const [estoqueMinimo, setEstoqueMinimo] = useState<number>(produtoParaEditar?.estoque_minimo || 0);
  const [estoqueMaximo, setEstoqueMaximo] = useState<number>(produtoParaEditar?.estoque_maximo || 0);
  const [controlaLote, setControlaLote] = useState<boolean>(produtoParaEditar?.controla_lote || false);

  // Estados de Controle de UI
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    // Validações imediatas
    if (!codigo.trim()) {
      setErro('O código do material é obrigatório.');
      return;
    }
    if (!nome.trim()) {
      setErro('O nome do material é obrigatório.');
      return;
    }
    if (estoqueMinimo < 0) {
      setErro('O estoque mínimo não pode ser negativo.');
      return;
    }
    if (estoqueMaximo < 0) {
      setErro('O estoque máximo não pode ser negativo.');
      return;
    }
    if (estoqueMaximo > 0 && estoqueMaximo < estoqueMinimo) {
      setErro('O estoque máximo não pode ser menor que o estoque mínimo.');
      return;
    }

    setSalvando(true);
    try {
      if (modoEdicao && produtoParaEditar) {
        const dtoAtualizar: AtualizarProdutoDTO = {
          codigo: codigo.trim(),
          nome: nome.trim(),
          descricao: descricao.trim() || null,
          categoria,
          unidade_medida: unidadeMedida,
          fabricante: fabricante.trim() || null,
          localizacao: localizacao.trim() || null,
          estoque_minimo: estoqueMinimo,
          estoque_maximo: estoqueMaximo,
          controla_lote: controlaLote,
        };
        const atualizado = await productService.atualizar(produtoParaEditar.id, dtoAtualizar);
        aoSalvarSucesso(atualizado);
      } else {
        const dtoCriar: CriarProdutoDTO = {
          codigo: codigo.trim(),
          nome: nome.trim(),
          descricao: descricao.trim() || null,
          categoria,
          unidade_medida: unidadeMedida,
          fabricante: fabricante.trim() || null,
          localizacao: localizacao.trim() || null,
          estoque_minimo: estoqueMinimo,
          estoque_maximo: estoqueMaximo,
          controla_lote: controlaLote,
        };
        const criado = await productService.criar(dtoCriar);
        aoSalvarSucesso(criado);
      }
    } catch (err: any) {
      const errTratado = formatarErroBanco(err);
      setErro(errTratado.mensagem);
    } finally {
      setSalvando(false);
    }
  }

  // Suporte a fechamento por tecla Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !salvando) {
        aoFechar();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [aoFechar, salvando]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget && !salvando) aoFechar();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-zinc-800 bg-zinc-950/60">
          <div>
            <h2 className="text-base font-bold text-zinc-100">
              {modoEdicao ? 'Editar Material' : 'Cadastrar Novo Material'}
            </h2>
            <p className="text-xs text-zinc-400">
              {modoEdicao 
                ? 'Atualize os dados cadastrais do material.' 
                : 'Cadastre as especificações do catálogo. Novo material inicia com saldo zero.'}
            </p>
          </div>
          <button
            onClick={aoFechar}
            disabled={salvando}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
            aria-label="Fechar formulário de material"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
          {/* Alerta Educativo de Saldo Inicial Zero (Apenas em Criação) */}
          {!modoEdicao && (
            <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/60 text-amber-200 text-xs flex items-start gap-2.5">
              <Layers className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-semibold text-amber-300 block mb-0.5">Saldo Inicial 0,000</span>
                O cadastro cria unicamente o registro do catálogo. Qualquer inclusão de estoque físico deve ser feita posteriormente pela operação auditada <strong>&ldquo;Registrar Entrada&rdquo;</strong>.
              </div>
            </div>
          )}

          {erro && (
            <div className="p-3 rounded-md bg-red-950/60 border border-red-900/80 text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{erro}</span>
            </div>
          )}

          {/* Código e Nome */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-zinc-400 font-mono uppercase text-[10px] mb-1 font-semibold">
                Código / SKU *
              </label>
              <input
                type="text"
                required
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Ex: TINT-001"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-zinc-200 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-zinc-400 font-mono uppercase text-[10px] mb-1 font-semibold">
                Nome do Material *
              </label>
              <input
                type="text"
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Tinta Epóxi Cinza Médio"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-zinc-200 focus:outline-none focus:border-amber-500 font-medium text-sm"
              />
            </div>
          </div>

          {/* Categoria e Unidade de Medida */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-mono uppercase text-[10px] mb-1 font-semibold">
                Categoria *
              </label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as CategoriaProduto)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-zinc-200 focus:outline-none focus:border-amber-500"
              >
                {CATEGORIAS_VALIDAS.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-zinc-400 font-mono uppercase text-[10px] mb-1 font-semibold">
                Unidade de Medida *
              </label>
              <select
                value={unidadeMedida}
                onChange={(e) => setUnidadeMedida(e.target.value as UnidadeMedida)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-zinc-200 focus:outline-none focus:border-amber-500 font-mono"
              >
                {UNIDADES_VALIDAS.map((un) => (
                  <option key={un} value={un}>
                    {un}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Estoque Mínimo e Máximo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-mono uppercase text-[10px] mb-1 font-semibold">
                Estoque Mínimo (Alerta de Reposição)
              </label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={estoqueMinimo}
                onChange={(e) => setEstoqueMinimo(parseFloat(e.target.value) || 0)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-zinc-200 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-mono uppercase text-[10px] mb-1 font-semibold">
                Estoque Máximo (Opcional)
              </label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={estoqueMaximo}
                onChange={(e) => setEstoqueMaximo(parseFloat(e.target.value) || 0)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-zinc-200 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          </div>

          {/* Localização e Fabricante */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 font-mono uppercase text-[10px] mb-1">
                Localização Física (Ex: Prateleira B-2)
              </label>
              <input
                type="text"
                value={localizacao}
                onChange={(e) => setLocalizacao(e.target.value)}
                placeholder="Prateleira, corredor, gaveta..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-zinc-200 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-mono uppercase text-[10px] mb-1">
                Fabricante / Marca
              </label>
              <input
                type="text"
                value={fabricante}
                onChange={(e) => setFabricante(e.target.value)}
                placeholder="Ex: Renner, Weg, Sherwin..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-zinc-200 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Descrição Técnica */}
          <div>
            <label className="block text-zinc-400 font-mono uppercase text-[10px] mb-1">
              Descrição Técnica / Observações
            </label>
            <textarea
              rows={2}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Especificações, acabamento, cor, etc."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-zinc-200 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          {/* Controle de Lote */}
          <div className="p-3.5 rounded-lg border border-zinc-800 bg-zinc-950/60 space-y-2">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={controlaLote}
                onChange={(e) => setControlaLote(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-amber-500/30"
              />
              <div className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-amber-400" />
                <span className="font-semibold text-zinc-200 text-xs">
                  Este produto controla lote e validade
                </span>
              </div>
            </label>
            <p className="text-[11px] text-zinc-500 pl-7 leading-relaxed">
              {controlaLote
                ? 'Atenção: produtos com controle de lote terão seus números de lote e validades cadastrados exclusivamente durante as entradas de estoque.'
                : 'O material será controlado unicamente pelo saldo consolidado do produto.'}
            </p>
          </div>

          {/* Botões de Ação */}
          <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={aoFechar}
              disabled={salvando}
              className="px-4 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-semibold transition-colors disabled:opacity-50 shadow-xs"
            >
              <Save className="w-4 h-4" />
              <span>{salvando ? 'Salvando...' : modoEdicao ? 'Salvar Alterações' : 'Cadastrar Material'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
