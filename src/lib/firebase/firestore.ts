/**
 * Nomes oficiais das coleções no Firestore do projeto controle-estoque-pintura.
 */
export const COLLECTIONS = {
  PRODUCTS: 'products',
  LOTS: 'lots',
  MOVEMENTS: 'movements',
  PHYSICAL_COUNTS: 'physicalCounts',
  USERS: 'users',
  IDEMPOTENCY_RECORDS: 'idempotency_records',
  AUDIT_LOGS: 'audit_logs',
} as const;

export type CollectionName = typeof COLLECTIONS[keyof typeof COLLECTIONS];


