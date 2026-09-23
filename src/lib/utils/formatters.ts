import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { SituacaoEstoque } from "@/types/stock";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatarQuantidade(valor: number, unidade?: string): string {
  const formatado = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(valor);

  return unidade ? `${formatado} ${unidade}` : formatado;
}

export function formatarDataHora(isoString: string): string {
  if (!isoString) return '-';
  try {
    const data = new Date(isoString);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(data);
  } catch {
    return isoString;
  }
}

export function formatarDataSimples(isoDateString: string): string {
  if (!isoDateString) return '-';
  try {
    const partes = isoDateString.split('T')[0].split('-');
    if (partes.length === 3) {
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    const data = new Date(isoDateString);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(data);
  } catch {
    return isoDateString;
  }
}

export function calcularSituacaoEstoque(saldo: number, minimo: number, maximo: number): SituacaoEstoque {
  if (saldo <= 0) {
    return 'SEM_ESTOQUE';
  }
  if (saldo < minimo) {
    return 'ABAIXO_DO_MINIMO';
  }
  if (saldo <= minimo * 1.15) { // 15% acima do mínimo
    return 'PROXIMO_DO_MINIMO';
  }
  if (maximo > 0 && saldo > maximo) {
    return 'ACIMA_DO_MAXIMO';
  }
  return 'NORMAL';
}
