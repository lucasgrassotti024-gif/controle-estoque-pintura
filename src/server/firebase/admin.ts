import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Firestore, DocumentReference, Transaction } from 'firebase-admin/firestore';

/**
 * ==============================================================================
 * CENTRALIZAÇÃO DO FIREBASE ADMIN SDK (SERVER-SIDE EXCLUSIVO)
 * ==============================================================================
 * Projeto: controle-custo-4696f
 * Executado SOMENTE no ambiente Node.js / Route Handlers do Next.js.
 * NUNCA importar este arquivo em componentes do cliente.
 * 
 * Se variáveis com credenciais de service account não estiverem configuradas,
 * inicializa com o projectId (Application Default Credentials / Emulator / Firestore).
 */

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'controle-custo-4696f';

if (getApps().length === 0) {
  // Inicialização segura sem expor arquivos ou chaves no código
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;

  if (clientEmail && privateKey) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    });
  } else {
    // Inicialização padrão pelo Project ID (compatível com ADC, GCP e desenvolvimento)
    initializeApp({
      projectId,
    });
  }
}

export const adminDb: Firestore = getFirestore();
export type { DocumentReference, Transaction };
