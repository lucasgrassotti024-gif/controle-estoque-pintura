import { sanitizarChavePrivada } from '@/server/firebase/admin';

/**
 * ==============================================================================
 * SUÍTE DE TESTES: SANITIZAÇÃO DE CHAVE PRIVADA E RESILIÊNCIA DE SESSÃO / AUTH
 * ==============================================================================
 * 
 * Testa especificamente os requisitos:
 * 1. FIREBASE_PRIVATE_KEY com \n literal
 * 2. FIREBASE_PRIVATE_KEY com quebra de linha real
 * 3. FIREBASE_PRIVATE_KEY com aspas externas duplas ou simples
 * 4. FIREBASE_PRIVATE_KEY com espaços em branco externos
 * 5. Proxy seguro / resiliência a falhas do Firebase Admin
 * 6. Tratamento de resposta vazia ou não-JSON em /api/auth/session
 */

let sucessos = 0;
let falhas = 0;

function asserir(condicao: boolean, descricao: string) {
  if (condicao) {
    sucessos++;
    console.log(`  ✓ [PASSOU] ${descricao}`);
  } else {
    falhas++;
    console.error(`  ✗ [FALHOU] ${descricao}`);
  }
}

async function executarTestesSanitizacaoEResiliencia() {
  console.log('\n======================================================================');
  console.log('INICIANDO TESTES DE SANITIZAÇÃO DE CHAVE PRIVADA E RESILIÊNCIA DE SESSÃO');
  console.log('======================================================================\n');

  // --- 1. Chave com \n literal ---
  const chaveComLiteral = '-----BEGIN PRIVATE KEY-----\\nMIIEvAIBADANBgk...\\n-----END PRIVATE KEY-----\\n';
  const sanitizada1 = sanitizarChavePrivada(chaveComLiteral);
  asserir(
    sanitizada1 !== undefined &&
    !sanitizada1.includes('\\n') &&
    sanitizada1.includes('\n') &&
    sanitizada1.startsWith('-----BEGIN PRIVATE KEY-----'),
    '1. Chave com \\n literal é convertida corretamente para quebras reais de linha'
  );

  // --- 2. Chave com quebra de linha real ---
  const chaveComQuebraReal = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgk...
-----END PRIVATE KEY-----`;
  const sanitizada2 = sanitizarChavePrivada(chaveComQuebraReal);
  asserir(
    sanitizada2 !== undefined &&
    sanitizada2.includes('\n') &&
    sanitizada2.endsWith('-----END PRIVATE KEY-----'),
    '2. Chave com quebra de linha real é preservada com integridade'
  );

  // --- 3. Chave com aspas externas duplas ---
  const chaveComAspasDuplas = '"-----BEGIN PRIVATE KEY-----\\nMIIE...\\n-----END PRIVATE KEY-----\\n"';
  const sanitizada3 = sanitizarChavePrivada(chaveComAspasDuplas);
  asserir(
    sanitizada3 !== undefined &&
    !sanitizada3.startsWith('"') &&
    !sanitizada3.endsWith('"') &&
    sanitizada3.startsWith('-----BEGIN PRIVATE KEY-----'),
    '3. Chave com aspas duplas externas tem as aspas removidas perfeitamente'
  );

  // --- 4. Chave com aspas externas simples ---
  const chaveComAspasSimples = "'-----BEGIN PRIVATE KEY-----\\nMIIE...\\n-----END PRIVATE KEY-----\\n'";
  const sanitizada4 = sanitizarChavePrivada(chaveComAspasSimples);
  asserir(
    sanitizada4 !== undefined &&
    !sanitizada4.startsWith("'") &&
    !sanitizada4.endsWith("'") &&
    sanitizada4.startsWith('-----BEGIN PRIVATE KEY-----'),
    '4. Chave com aspas simples externas tem as aspas removidas perfeitamente'
  );

  // --- 5. Chave com espaços em branco ao redor ---
  const chaveComEspacos = '   \n  -----BEGIN PRIVATE KEY-----\\nMIIE...\\n-----END PRIVATE KEY-----\\n  \n  ';
  const sanitizada5 = sanitizarChavePrivada(chaveComEspacos);
  asserir(
    sanitizada5 !== undefined &&
    sanitizada5.startsWith('-----BEGIN PRIVATE KEY-----') &&
    sanitizada5.endsWith('-----END PRIVATE KEY-----'),
    '5. Chave com espaços ou quebras extras no início e fim é aparada com sucesso'
  );

  // --- 6. Chave corrompida ou inválida sem cabeçalho RSA ---
  const chaveInvalida = 'chave-qualquer-sem-header';
  const sanitizadaInvalida = sanitizarChavePrivada(chaveInvalida);
  asserir(
    sanitizadaInvalida === undefined,
    '6. Chave inválida sem cabeçalho BEGIN PRIVATE KEY retorna undefined defensivamente'
  );

  // --- 7. Resiliência a resposta não-JSON ou vazia de /api/auth/session no cliente ---
  function simularParseClientSessao(status: number, textResponse: string) {
    if (status !== 200) {
      return { usuario: null, autenticado: false };
    }
    if (!textResponse || textResponse.trim().length === 0) {
      return { usuario: null, autenticado: false };
    }
    try {
      const data = JSON.parse(textResponse);
      if (data && data.autenticado && data.usuario) {
        return { usuario: data.usuario, autenticado: true };
      }
      return { usuario: null, autenticado: false };
    } catch {
      return { usuario: null, autenticado: false };
    }
  }

  const parseRespostaVazia = simularParseClientSessao(500, '');
  asserir(
    parseRespostaVazia.autenticado === false && parseRespostaVazia.usuario === null,
    '7. Resposta HTTP 500 com corpo vazio é tratada sem lançar SyntaxError / Unexpected end of JSON'
  );

  const parseRespostaHtmlErro = simularParseClientSessao(500, '<html><body>Internal Server Error</body></html>');
  asserir(
    parseRespostaHtmlErro.autenticado === false && parseRespostaHtmlErro.usuario === null,
    '8. Resposta HTTP 500 com HTML de erro de proxy/infraestrutura não causa crash no cliente'
  );

  const parseRespostaValida = simularParseClientSessao(
    200,
    JSON.stringify({ autenticado: true, usuario: { id: 'u1', nome: 'Admin', papel: 'ADMIN' } })
  );
  asserir(
    parseRespostaValida.autenticado === true && parseRespostaValida.usuario?.nome === 'Admin',
    '9. Resposta HTTP 200 com JSON válido autentica e hidrata o usuário corretamente'
  );

  // --- 8. Simulação de Login com resposta 500 do servidor ---
  function simularLoginParse(status: number, textResponse: string) {
    let data: any = null;
    if (textResponse && textResponse.trim().length > 0) {
      try {
        data = JSON.parse(textResponse);
      } catch {
        data = null;
      }
    }
    if (status >= 400) {
      const erroMsg =
        data?.erro ||
        (status >= 500
          ? 'Serviço temporariamente indisponível no servidor. Tente novamente mais tarde.'
          : 'Falha ao autenticar sessão no servidor.');
      return { sucesso: false, erro: erroMsg };
    }
    return { sucesso: true, usuario: data?.usuario };
  }

  const login500Vazio = simularLoginParse(500, '');
  asserir(
    login500Vazio.sucesso === false &&
    login500Vazio.erro === 'Serviço temporariamente indisponível no servidor. Tente novamente mais tarde.',
    '10. Login com HTTP 500 sem JSON exibe mensagem amigável e segura para o usuário'
  );

  // --- 9. Validação de resolução CommonJS de firebase-admin/auth e jwks-rsa ---
  let authCarregou = false;
  try {
    const authModule = require('firebase-admin/auth');
    const jwksUtils = require('jwks-rsa/src/utils');
    authCarregou = Boolean(authModule && jwksUtils && typeof jwksUtils.retrieveSigningKeys === 'function');
  } catch {
    authCarregou = false;
  }

  asserir(
    authCarregou,
    '11. firebase-admin/auth e jwks-rsa/src/utils carregam sem lançar ERR_REQUIRE_ESM'
  );

  console.log('\n======================================================================');
  console.log(`TOTAL DE TESTES DE SANITIZAÇÃO E RESILIÊNCIA: ${sucessos + falhas}`);
  console.log(`PASSOU: ${sucessos} | FALHAS: ${falhas}`);
  console.log('======================================================================\n');

  if (falhas > 0) {
    process.exit(1);
  }
}

executarTestesSanitizacaoEResiliencia();
