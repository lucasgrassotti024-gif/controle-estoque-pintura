import { db } from '@/lib/firebase/config';
import { COLLECTIONS } from '@/lib/firebase/firestore';
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  query, 
  where, 
  orderBy 
} from 'firebase/firestore';
import { Lote } from '@/types/stock';
import { formatarErroBanco } from '@/lib/utils/error-handler';

/**
 * Repositório para consulta de Lotes de materiais (Firestore).
 * Lotes são unicamente gerenciados (saldo) via transações atômicas de estoque.
 */
export const lotRepository = {
  async listarPorProduto(produtoId: string, apenasComSaldo: boolean = false): Promise<Lote[]> {
    try {
      const colRef = collection(db, COLLECTIONS.LOTS);
      let q = query(
        colRef,
        where('produto_id', '==', produtoId),
        where('ativo', '==', true),
        orderBy('criado_em', 'asc')
      );

      const snapshot = await getDocs(q);
      let lotes: Lote[] = snapshot.docs.map((docSnap) => ({
        ...(docSnap.data() as Lote),
        id: docSnap.id,
      }));

      if (apenasComSaldo) {
        lotes = lotes.filter((l) => l.saldo_lote > 0);
      }

      return lotes;
    } catch (error: any) {
      throw new Error(formatarErroBanco(error).mensagem);
    }
  },

  async buscarPorId(loteId: string): Promise<Lote | null> {
    try {
      const docRef = doc(db, COLLECTIONS.LOTS, loteId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        return null;
      }

      return {
        ...(docSnap.data() as Lote),
        id: docSnap.id,
      };
    } catch (error: any) {
      throw new Error(formatarErroBanco(error).mensagem);
    }
  },

  async buscarPorNumero(produtoId: string, numeroLote: string): Promise<Lote | null> {
    try {
      const colRef = collection(db, COLLECTIONS.LOTS);
      const q = query(
        colRef,
        where('produto_id', '==', produtoId),
        where('numero_lote', '==', numeroLote.trim())
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return null;
      }

      const docSnap = snapshot.docs[0];
      return {
        ...(docSnap.data() as Lote),
        id: docSnap.id,
      };
    } catch (error: any) {
      throw new Error(formatarErroBanco(error).mensagem);
    }
  },
};
