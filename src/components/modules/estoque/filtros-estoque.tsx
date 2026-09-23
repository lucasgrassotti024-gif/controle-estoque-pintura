import React from 'react';
import { 
  CategoriaProduto, 
  CATEGORIAS_VALIDAS, 
  SituacaoEstoque 
} from '@/types/stock';
import { Search, Filter, X } from 'lucide-react';

interface FiltrosEstoqueProps {
  termo: string;
  onTermoChange: (valor: string) => void;
  categoriaSelecionada: CategoriaProduto | 'TODAS';
  onCategoriaChange: (categoria: CategoriaProduto | 'TODAS') => void;
  situacaoSelecionada: SituacaoEstoque | 'TODAS';
  onSituacaoChange: (situacao: SituacaoEstoque | 'TODAS') => void;
  apenasAtivos: boolean;
  onApenasAtivosChange: (apenasAtivos: boolean) => void;
  onLimparFiltros: () => void;
  totalResultados: number;
}

const SITUACOES_FILTRO: { valor: SituacaoEstoque | 'TODAS'; rotulo: string }[] = [
  { valor: 'TODAS', rotulo: 'Todas as Situações' },
  { valor: 'SEM_ESTOQUE', rotulo: 'Sem Estoque' },
  { valor: 'ABAIXO_DO_MINIMO', rotulo: 'Abaixo do Mínimo' },
  { valor: 'PROXIMO_DO_MINIMO', rotulo: 'Próximo do Mínimo' },
  { valor: 'NORMAL', rotulo: 'Normal' },
  { valor: 'ACIMA_DO_MAXIMO', rotulo: 'Acima do Máximo' },
];

export function FiltrosEstoque({
  termo,
  onTermoChange,
  categoriaSelecionada,
  onCategoriaChange,
  situacaoSelecionada,
  onSituacaoChange,
  apenasAtivos,
  onApenasAtivosChange,
  onLimparFiltros,
  totalResultados,
}: FiltrosEstoqueProps) {
  const temFiltroAtivo = 
    termo.trim() !== '' || 
    categoriaSelecionada !== 'TODAS' || 
    situacaoSelecionada !== 'TODAS' || 
    !apenasAtivos;

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 sm:p-4 mb-6 space-y-3">
      <div className="flex flex-col md:flex-row gap-3">
        {/* Campo de Busca por Texto / Código */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nome do material ou código..."
            value={termo}
            onChange={(e) => onTermoChange(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-md pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/30 transition-colors"
          />
        </div>

        {/* Seletor de Categoria */}
        <div className="w-full md:w-52">
          <select
            value={categoriaSelecionada}
            onChange={(e) => onCategoriaChange(e.target.value as CategoriaProduto | 'TODAS')}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/30 transition-colors"
            aria-label="Filtrar por categoria"
          >
            <option value="TODAS">Todas as Categorias</option>
            {CATEGORIAS_VALIDAS.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Seletor de Situação */}
        <div className="w-full md:w-52">
          <select
            value={situacaoSelecionada}
            onChange={(e) => onSituacaoChange(e.target.value as SituacaoEstoque | 'TODAS')}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/30 transition-colors"
            aria-label="Filtrar por situação de estoque"
          >
            {SITUACOES_FILTRO.map((sit) => (
              <option key={sit.valor} value={sit.valor}>
                {sit.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Barra de Ações Rápidas do Filtro */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800/60 text-xs">
        <div className="flex items-center gap-4">
          <label className="inline-flex items-center gap-2 cursor-pointer text-zinc-400 select-none hover:text-zinc-200">
            <input
              type="checkbox"
              checked={apenasAtivos}
              onChange={(e) => onApenasAtivosChange(e.target.checked)}
              className="rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-amber-500/30"
            />
            <span>Apenas materiais ativos</span>
          </label>

          <span className="text-zinc-500 font-mono">
            {totalResultados} {totalResultados === 1 ? 'material listado' : 'materiais listados'}
          </span>
        </div>

        {temFiltroAtivo && (
          <button
            onClick={onLimparFiltros}
            className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-amber-400 transition-colors py-1 px-2 rounded hover:bg-zinc-800"
          >
            <X className="w-3.5 h-3.5" />
            <span>Limpar filtros</span>
          </button>
        )}
      </div>
    </div>
  );
}
