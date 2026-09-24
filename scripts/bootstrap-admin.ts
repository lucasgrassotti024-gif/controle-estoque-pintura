import * as fs from 'fs';
import * as path from 'path';
import { COLLECTIONS } from '../src/lib/firebase/firestore';

// 1. Carregar variáveis de ambiente locais de .env.local antes de importar o Firebase Admin
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        let val = trimmed.substring(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        process.env[key] = val;
      }
    }
  });
}

/**
 * ==============================================================================
 * BOOTSTRAP ADMINISTRATIVO LOCAL E EXPLÍCITO (FASE 20)
 * ==============================================================================
 * Criação controlada do primeiro usuário com papel ADMIN.
 * NUNCA executa automaticamente.
 * NUNCA expõe endpoint público de auto-promoção.
 * 
 * Uso via terminal:
 * npx tsx scripts/bootstrap-admin.ts <email> <senha> <nome>
 */

async function bootstrapAdmin() {
  const args = process.argv.slice(2);
  const email = args[0] || 'admin@rss3.com.br';
  const senha = args[1] || 'Admin@123456';
  const nome = args[2] || 'Administrador Master';

  console.log('======================================================================');
  console.log('BOOTSTRAP DE ADMINISTRADOR LOCAL — RSS3 CONTROLE DE ESTOQUE');
  console.log('======================================================================');
  console.log(`E-mail: ${email}`);
  console.log(`Nome:   ${nome}`);
  console.log(`Papel:  ADMIN`);
  console.log('----------------------------------------------------------------------');

  // Importar dinamicamente o Firebase Admin após carregar as variáveis de ambiente
  const { adminAuth, adminDb } = await import('../src/server/firebase/admin');

  try {
    let userRecord;

    // 1. Verificar se usuário já existe no Firebase Authentication
    try {
      userRecord = await adminAuth.getUserByEmail(email);
      console.log(`ℹ Usuário já existe no Firebase Auth (UID: ${userRecord.uid}). Atualizando perfil...`);

      await adminAuth.updateUser(userRecord.uid, {
        password: senha,
        displayName: nome,
        disabled: false,
      });
    } catch (notFound) {
      console.log('Criando novo usuário no Firebase Authentication...');
      userRecord = await adminAuth.createUser({
        email,
        password: senha,
        displayName: nome,
        disabled: false,
      });
      console.log(`✓ Usuário criado no Firebase Auth (UID: ${userRecord.uid})`);
    }

    // 2. Gravar perfil com papel ADMIN na coleção users/{uid} do Firestore (NUNCA salvar senha)
    const now = new Date().toISOString();
    const userDocRef = adminDb.collection(COLLECTIONS.USERS).doc(userRecord.uid);
    const userDoc = await userDocRef.get();

    const dadosUsuario = {
      uid: userRecord.uid,
      email,
      nome,
      papel: 'ADMIN',
      ativo: true,
      atualizadoEm: now,
      criadoEm: userDoc.exists ? (userDoc.data()?.criadoEm || now) : now,
    };

    await userDocRef.set(dadosUsuario, { merge: true });
    console.log(`✓ Perfil ADMIN gravado com sucesso em users/${userRecord.uid} no Firestore.`);
    console.log('======================================================================');
    console.log('CONCLUÍDO COM SUCESSO! Você pode fazer login no sistema com essas credenciais.');
    console.log('======================================================================');
    process.exit(0);
  } catch (error: any) {
    console.error('✗ Erro ao realizar bootstrap do usuário ADMIN:', error.message);
    process.exit(1);
  }
}

bootstrapAdmin();
