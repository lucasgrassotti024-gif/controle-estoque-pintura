/**
 * Nomes oficiais das coleções no Firestore do projeto controle-estoque-pintura.
 */
export const COLLECTIONS = {
  PRODUCTS: 'products',
  LOTS: 'lots',
  MOVEMENTS: 'movements',
  PHYSICAL_COUNTS: 'physicalCounts',
} as const;

export type CollectionName = typeof COLLECTIONS[keyof typeof COLLECTIONS];
