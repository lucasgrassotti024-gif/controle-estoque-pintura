import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Firestore, DocumentReference, Transaction } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';

/**
 * ==============================================================================
 * CENTRALIZAÇÃO DO FIREBASE ADMIN SDK (SERVER-SIDE EXCLUSIVO)
 * ==============================================================================
 * Projeto: controle-custo-4696f
 * Executado SOMENTE no ambiente Node.js / Route Handlers do Next.js.
 * NUNCA importar este arquivo em componentes do cliente.
 */

const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  'controle-custo-4696f';

/**
 * Sanitiza e normaliza a chave privada RSA do Firebase Admin.
 * Suporta:
 * - Quebras literais "\n" (como no .env)
 * - Quebras de linha reais
 * - Aspas externas simples ou duplas geradas ao colar na UI do Vercel
 * - Espaços em branco externos
 */
export function sanitizarChavePrivada(rawKey?: string | null): string | undefined {
  if (!rawKey || typeof rawKey !== 'string') {
    return undefined;
  }

  let cleaned = rawKey.trim();

  // Remove aspas simples ou duplas externas se presentes
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Normaliza quebras de linha literais '\n' para quebras reais de linha
  cleaned = cleaned.replace(/\\n/g, '\n').trim();

  // Garante que o cabeçalho e rodapé estejam íntegros
  if (!cleaned.includes('-----BEGIN PRIVATE KEY-----')) {
    return undefined;
  }

  return cleaned;
}

let adminInitError: Error | null = null;

function inicializarFirebaseAdmin() {
  if (getApps().length > 0) {
    return;
  }

  try {
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
    const privateKey = sanitizarChavePrivada(process.env.FIREBASE_PRIVATE_KEY);

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
      // Inicialização com Application Default Credentials / Project ID
      initializeApp({
        projectId,
      });
    }
    adminInitError = null;
  } catch (error: any) {
    adminInitError = error instanceof Error ? error : new Error(String(error));
    // Log técnico no servidor sem vazar chaves ou credenciais
    console.error(
      `[Firebase Admin SDK Init Error]: Falha ao inicializar para o projeto "${projectId}". Detalhe técnico: ${error?.message || error}`
    );
  }
}

// Inicializa no carregamento do módulo de forma resiliente
inicializarFirebaseAdmin();

/**
 * Proxy seguro para o Firestore do Firebase Admin.
 * Se o SDK não tiver inicializado ou falhado, tenta reinicializar ou lança
 * um erro controlado que pode ser capturado pelo try/catch do endpoint.
 */
export const adminDb: Firestore = new Proxy({} as Firestore, {
  get(_target, prop) {
    if (getApps().length === 0) {
      inicializarFirebaseAdmin();
    }
    if (adminInitError) {
      throw new Error(`Firebase Admin Firestore indisponível: ${adminInitError.message}`);
    }
    const realDb = getFirestore();
    const value = (realDb as any)[prop];
    return typeof value === 'function' ? value.bind(realDb) : value;
  },
});

/**
 * Proxy seguro para o Auth do Firebase Admin.
 * Se o SDK não tiver inicializado ou falhado, tenta reinicializar ou lança
 * um erro controlado que pode ser capturado pelo try/catch do endpoint.
 */
export const adminAuth: Auth = new Proxy({} as Auth, {
  get(_target, prop) {
    if (getApps().length === 0) {
      inicializarFirebaseAdmin();
    }
    if (adminInitError) {
      throw new Error(`Firebase Admin Auth indisponível: ${adminInitError.message}`);
    }
    const realAuth = getAuth();
    const value = (realAuth as any)[prop];
    return typeof value === 'function' ? value.bind(realAuth) : value;
  },
});

export type { DocumentReference, Transaction };


