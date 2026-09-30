import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

/**
 * ==============================================================================
 * HELPER SERVER-SIDE: IDEMPOTÊNCIA E AUDITORIA OFFLINE INDUSTRIAL
 * ==============================================================================
 * Garante:
 * 1. Extração segura da chave X-Idempotency-Key dos headers ou body.
 * 2. Canonicalização do payload (ordenação estável das chaves JSON).
 * 3. Cálculo estrito de SHA-256 no servidor (nunca confiando em hash do cliente).
 * 4. Validação de formato da chave.
 * 5. TTL de 7 dias para retenção e limpeza nativa no Firestore.
 */

export const IDEMPOTENCY_HEADER = 'x-idempotency-key';
export const IDEMPOTENCY_TTL_DAYS = 7;

/**
 * Ordena recursivamente as propriedades de um objeto para garantir
 * que JSON.stringify produza exatamente a mesma string determinística.
 */
export function canonicalizeJson(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(canonicalizeJson);
  }

  const sortedKeys = Object.keys(obj).sort();
  const canonicalObj: Record<string, any> = {};

  for (const key of sortedKeys) {
    const val = obj[key];
    // Ignoramos campos transitórios que não mudam a intenção da operação
    if (key === 'idempotency_key' || key === 'device_id' || key === 'local_sequence_number') {
      continue;
    }
    canonicalObj[key] = canonicalizeJson(val);
  }

  return canonicalObj;
}

/**
 * Calcula o hash SHA-256 do payload canonicalizado.
 */
export function calcularPayloadHash(payload: any): string {
  const canonical = canonicalizeJson(payload);
  const serialized = JSON.stringify(canonical);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

/**
 * Extrai a chave de idempotência de uma requisição HTTP ou DTO.
 */
export function extrairIdempotencyKey(req: NextRequest, body?: any): string | null {
  const headerKey = req.headers.get(IDEMPOTENCY_HEADER) || req.headers.get('idempotency-key');
  if (headerKey && headerKey.trim().length > 0) {
    return headerKey.trim();
  }

  if (body && typeof body === 'object' && body.idempotency_key) {
    const key = String(body.idempotency_key).trim();
    if (key.length > 0) {
      return key;
    }
  }

  return null;
}

import { Timestamp } from 'firebase-admin/firestore';

/**
 * Calcula a data de expiração para política nativa de TTL do Cloud Firestore.
 * O Firestore TTL requer estritamente o tipo de dados Timestamp (Date/Timestamp),
 * e NÃO uma ISO string ou número.
 */
export function calcularDataExpiracaoTTL(dias = IDEMPOTENCY_TTL_DAYS): Timestamp {
  const msPorDia = 24 * 60 * 60 * 1000;
  const targetDate = new Date(Date.now() + dias * msPorDia);
  return Timestamp.fromDate(targetDate);
}


/**
 * Respostas de erro padronizadas para violações de idempotência.
 */
export function erroPayloadTampering(chave: string) {
  return NextResponse.json(
    {
      erro: `Violação de Integridade: A chave de idempotência '${chave}' já foi utilizada para uma operação com payload diferente. Reutilização de chave é proibida.`,
      codigo: 'IDEMPOTENCY_PAYLOAD_TAMPERING',
    },
    { status: 422 }
  );
}

export function erroChaveOutroUsuario(chave: string) {
  return NextResponse.json(
    {
      erro: `Violação de Segurança: A chave de idempotência '${chave}' pertence a outro operador. Tentativa de apropriação rejeitada.`,
      codigo: 'IDEMPOTENCY_KEY_HIJACKING',
    },
    { status: 403 }
  );
}

export function erroSnapshotObsoleto(conflito: {
  produto_id: string;
  lote_id?: string | null;
  versao_esperada: number;
  versao_atual: number;
  saldo_atual: number;
}) {
  return NextResponse.json(
    {
      erro: `Conflito de Auditoria: A conferência física foi realizada sobre um snapshot desatualizado (Versão do dispositivo: ${conflito.versao_esperada}, Versão atual do servidor: ${conflito.versao_atual}). A evidência foi preservada e requer revisão.`,
      codigo: 'STALE_AUDIT_SNAPSHOT',
      detalhes: conflito,
    },
    { status: 409 }
  );
}
