import React from 'react';
import { SituacaoEstoque } from '@/types/stock';
import { cn } from '@/lib/utils/formatters';
import { AlertTriangle, CheckCircle2, XCircle, AlertCircle, ArrowUpCircle } from 'lucide-react';

interface SituacaoBadgeProps {
  situacao: SituacaoEstoque;
  className?: string;
  tamanho?: 'sm' | 'md';
}

const CONFIGURACAO_SITUACAO: Record<
  SituacaoEstoque,
  {
    rotulo: string;
    icone: React.ComponentType<{ className?: string }>;
    estilo: string;
  }
> = {
  SEM_ESTOQUE: {
    rotulo: 'Sem Estoque',
    icone: XCircle,
    estilo: 'bg-red-950/80 text-red-400 border-red-800/80',
  },
  ABAIXO_DO_MINIMO: {
    rotulo: 'Abaixo do Mínimo',
    icone: AlertTriangle,
    estilo: 'bg-amber-950/80 text-amber-400 border-amber-800/80',
  },
  PROXIMO_DO_MINIMO: {
    rotulo: 'Próximo do Mínimo',
    icone: AlertCircle,
    estilo: 'bg-yellow-950/80 text-yellow-400 border-yellow-800/80',
  },
  NORMAL: {
    rotulo: 'Normal',
    icone: CheckCircle2,
    estilo: 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80',
  },
  ACIMA_DO_MAXIMO: {
    rotulo: 'Acima do Máximo',
    icone: ArrowUpCircle,
    estilo: 'bg-blue-950/80 text-blue-400 border-blue-800/80',
  },
};

export function SituacaoBadge({ situacao, className, tamanho = 'md' }: SituacaoBadgeProps) {
  const config = CONFIGURACAO_SITUACAO[situacao] || CONFIGURACAO_SITUACAO.NORMAL;
  const Icone = config.icone;

  const classesTamanho = tamanho === 'sm' 
    ? 'px-2 py-0.5 text-xs gap-1' 
    : 'px-2.5 py-1 text-xs font-medium gap-1.5';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border font-medium tracking-wide uppercase',
        classesTamanho,
        config.estilo,
        className
      )}
      title={`Situação do material: ${config.rotulo}`}
    >
      <Icone className={tamanho === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      <span>{config.rotulo}</span>
    </span>
  );
}
