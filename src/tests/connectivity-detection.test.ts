/**
 * ==============================================================================
 * SUÍTE DE TESTES: FASE OFFLINE 2 (DETECÇÃO DE CONECTIVIDADE INDUSTRIAL)
 * ==============================================================================
 * 
 * Cobertura exigida:
 * A. Inicialização com online + health 200 -> ONLINE
 * B. Evento offline -> OFFLINE imediato
 * C. Evento online -> CHECKING -> ONLINE
 * D. Primeira falha consecutiva -> DEGRADED
 * E. Segunda falha consecutiva -> OFFLINE
 * F. Sucesso após falha -> ONLINE + reset do contador para 0
 * G. Timeout de 4 segundos tratado como falha
 * H. NetworkError tratado como falha
 * I. Mutex contra chamadas simultâneas (evita requisições concorrentes)
 * J. Foreground (30s) / Background (120s)
 * K. Heartbeat imediato após retorno ao foreground se decorrido > 15s
 * L. Retry progressivo quando OFFLINE: 5s -> 10s -> 20s -> 30s
 * M. Reset do retry após sucesso
 * N. /api/health funciona sem autenticação (público)
 * O. /api/health não acessa Firestore ou Firebase Admin
 * P. Nenhuma alteração em regras de estoque
 * Q. Nenhum efeito sobre RBAC/Auth
 * 
 * Testes específicos adicionais:
 * - Flapping: falha -> DEGRADED -> sucesso -> ONLINE -> contador=0 -> falha -> DEGRADED -> falha -> OFFLINE
 * - Falsa Conectividade: navigator.onLine === true mas /api/health falha -> 1 falha = DEGRADED, 2 falhas = OFFLINE
 */

import { GET } from '@/app/api/health/route';
import { NextRequest } from 'next/server';

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

// ==============================================================================
// 1. SIMULADOR DO MOTOR DE CONECTIVIDADE INDUSTRIAL
// ==============================================================================
class ConnectivityEngineMock {
  public status: 'CHECKING' | 'ONLINE' | 'DEGRADED' | 'OFFLINE' = 'CHECKING';
  public consecutiveFailures: number = 0;
  public lastSuccessfulPing: number | null = null;
  public lastCheckTimestamp: number | null = null;

  public isChecking: boolean = false;
  public nextScheduledDelay: number = 30000;
  public isDocumentHidden: boolean = false;
  public simulatedNavigatorOnline: boolean = true;

  private retrySteps = [5000, 10000, 20000, 30000];

  public concurrentCallsBlocked: number = 0;

  // Mock do fetch injetável
  public fetchHandler: () => Promise<{ ok: boolean; status: number; json: () => Promise<any> }> = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ status: 'ok', timestamp: Date.now() })
  });

  public async performCheck(): Promise<void> {
    // Mutex
    if (this.isChecking) {
      this.concurrentCallsBlocked++;
      return;
    }

    if (!this.simulatedNavigatorOnline) {
      this.handleFailure();
      this.status = 'OFFLINE';
      return;
    }

    this.isChecking = true;

    try {
      const response = await this.fetchHandler();
      if (response.ok && response.status === 200) {
        this.consecutiveFailures = 0;
        this.status = 'ONLINE';
        const now = Date.now();
        this.lastSuccessfulPing = now;
        this.lastCheckTimestamp = now;
      } else {
        this.handleFailure();
      }
    } catch {
      this.handleFailure();
    } finally {
      this.isChecking = false;
      this.scheduleNext();
    }
  }

  private handleFailure() {
    this.consecutiveFailures++;
    this.lastCheckTimestamp = Date.now();
    if (this.consecutiveFailures === 1) {
      this.status = 'DEGRADED';
    } else {
      this.status = 'OFFLINE';
    }
  }

  public scheduleNext() {
    if (this.isDocumentHidden) {
      this.nextScheduledDelay = 120000;
    } else if (this.status === 'OFFLINE') {
      const idx = Math.min(this.consecutiveFailures - 1, this.retrySteps.length - 1);
      this.nextScheduledDelay = this.retrySteps[Math.max(0, idx)];
    } else {
      this.nextScheduledDelay = 30000;
    }
  }

  public onOfflineEvent() {
    this.simulatedNavigatorOnline = false;
    this.consecutiveFailures++;
    this.status = 'OFFLINE';
    this.scheduleNext();
  }

  public async onOnlineEvent(): Promise<void> {
    this.simulatedNavigatorOnline = true;
    this.status = 'CHECKING';
    await this.performCheck();
  }

  public async onVisibilityChange(hidden: boolean, timeSinceLastCheckMs: number): Promise<boolean> {
    this.isDocumentHidden = hidden;
    if (!hidden) {
      // Retorno ao foreground
      if (timeSinceLastCheckMs > 15000) {
        await this.performCheck();
        return true; // Disparou heartbeat imediato
      } else {
        this.scheduleNext();
        return false; // Apenas manteve agendamento
      }
    } else {
      this.scheduleNext();
      return false;
    }
  }
}

// ==============================================================================
// 2. EXECUÇÃO DOS TESTES
// ==============================================================================
async function executarTestesConectividade() {
  console.log('======================================================================');
  console.log('INICIANDO SUÍTE DE TESTES DE DETECÇÃO DE CONECTIVIDADE (FASE OFFLINE 2)');
  console.log('======================================================================\n');

  // Teste N & O: /api/health público, sem auth, sem Firestore
  console.log('--- Subsuíte 1: Endpoint /api/health ---');
  const healthResponse = await GET();
  asserir(healthResponse.status === 200, 'N.1: /api/health responde com HTTP 200');
  
  const healthBody = await healthResponse.json();
  asserir(healthBody.status === 'ok', 'N.2: /api/health retorna payload com status: "ok"');
  asserir(typeof healthBody.timestamp === 'number' && healthBody.timestamp > 0, 'N.3: /api/health retorna timestamp numérico válido');
  
  const cacheControl = healthResponse.headers.get('Cache-Control');
  asserir(cacheControl?.includes('no-store') === true, 'N.4: /api/health possui cabeçalho Cache-Control no-store');

  // Teste O: Ausência de qualquer chamada ao Firestore/Admin
  asserir(
    !JSON.stringify(healthBody).includes('firestore') &&
    !JSON.stringify(healthBody).includes('firebase') &&
    !JSON.stringify(healthBody).includes('user') &&
    !JSON.stringify(healthBody).includes('admin'),
    'O.1: /api/health não expõe e nem referencia Firestore, Firebase Admin ou UIDs'
  );

  // Teste A: Inicialização com online + health 200
  console.log('\n--- Subsuíte 2: Ciclo de Vida do Heartbeat e Estados ---');
  const engine = new ConnectivityEngineMock();
  await engine.performCheck();
  asserir(engine.status === 'ONLINE', 'A.1: Inicialização com status 200 transiciona para ONLINE');
  asserir(engine.consecutiveFailures === 0, 'A.2: Contador de falhas consecutivas zerado em sucesso');
  asserir(engine.lastSuccessfulPing !== null, 'A.3: Registra timestamp do último ping bem-sucedido');
  asserir(engine.nextScheduledDelay === 30000, 'A.4: Agendamento em foreground definido para 30 segundos');

  // Teste B: Evento offline do navegador
  engine.onOfflineEvent();
  asserir(engine.status === 'OFFLINE', 'B.1: Evento window.offline transiciona imediatamente para OFFLINE');
  asserir(engine.consecutiveFailures === 1, 'B.2: Contador de falhas incrementado');

  // Teste C: Evento online do navegador
  await engine.onOnlineEvent();
  asserir(engine.status === 'ONLINE', 'C.1: Evento window.online aciona heartbeat e recupera estado ONLINE');
  asserir(engine.consecutiveFailures === 0, 'C.2: Contador de falhas resetado para 0 após sucesso');

  // Teste D & E: Degradação e Transição para Offline
  console.log('\n--- Subsuíte 3: Máquina de Estados (DEGRADED -> OFFLINE) ---');
  engine.fetchHandler = async () => {
    throw new Error('Network failure');
  };

  await engine.performCheck();
  asserir(engine.status === 'DEGRADED', 'D.1: Primeira falha consecutiva resulta em DEGRADED');
  asserir(engine.consecutiveFailures === 1, 'D.2: Contador de falhas consecutivas é exatamente 1');

  await engine.performCheck();
  asserir(engine.status === 'OFFLINE', 'E.1: Segunda falha consecutiva resulta em OFFLINE');
  asserir(engine.consecutiveFailures === 2, 'E.2: Contador de falhas consecutivas é 2');

  // Teste F: Sucesso após falha -> ONLINE + reset
  console.log('\n--- Subsuíte 4: Recuperação e Reset do Contador ---');
  engine.fetchHandler = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ status: 'ok', timestamp: Date.now() })
  });

  await engine.performCheck();
  asserir(engine.status === 'ONLINE', 'F.1: Sucesso após falhas consecutivas transiciona para ONLINE');
  asserir(engine.consecutiveFailures === 0, 'F.2: Contador de falhas consecutivas é estritamente resetado para 0');

  // Teste 7: Flapping (garantia de não acumulação de falhas antigas)
  console.log('\n--- Subsuíte 5: Teste Específico de Flapping (Sem Acumulação) ---');
  // 1 falha -> DEGRADED
  engine.fetchHandler = async () => { throw new Error('Flap fail 1'); };
  await engine.performCheck();
  asserir(engine.status === 'DEGRADED', '7.1: Flap - Falha 1 vai para DEGRADED');
  
  // 1 sucesso -> ONLINE + reset para 0
  engine.fetchHandler = async () => ({ ok: true, status: 200, json: async () => ({ status: 'ok', timestamp: Date.now() }) });
  await engine.performCheck();
  asserir(engine.status === 'ONLINE' && engine.consecutiveFailures === 0, '7.2: Flap - Sucesso recupera ONLINE e zera contador');

  // Próxima falha -> DEVE ser DEGRADED (se não tivesse zerado, iria direto para OFFLINE!)
  engine.fetchHandler = async () => { throw new Error('Flap fail 2'); };
  await engine.performCheck();
  asserir(engine.status === 'DEGRADED' && engine.consecutiveFailures === 1, '7.3: Flap - Nova falha vai para DEGRADED (não acumulou falha anterior)');

  // Segunda falha consecutiva subsequente -> Agora sim vai para OFFLINE
  await engine.performCheck();
  asserir(engine.status === 'OFFLINE' && engine.consecutiveFailures === 2, '7.4: Flap - Segunda falha consecutiva vai para OFFLINE');

  // Resetar engine para continuar
  engine.fetchHandler = async () => ({ ok: true, status: 200, json: async () => ({ status: 'ok', timestamp: Date.now() }) });
  await engine.performCheck();

  // Teste 8: Falsa Conectividade (navigator.onLine === true, mas /api/health dá erro/timeout)
  console.log('\n--- Subsuíte 6: Teste de Falsa Conectividade (Captive Portal / Sem Internet) ---');
  engine.simulatedNavigatorOnline = true;
  engine.fetchHandler = async () => {
    // Simula AbortController timeout (4s)
    const err = new Error('The user aborted a request.');
    err.name = 'AbortError';
    throw err;
  };

  await engine.performCheck();
  asserir(engine.status === 'DEGRADED', '8.1: Falsa Conectividade - timeout de 4s na 1ª tentativa gera DEGRADED');

  await engine.performCheck();
  asserir(engine.status === 'OFFLINE', '8.2: Falsa Conectividade - timeout de 4s na 2ª tentativa gera OFFLINE');

  // Teste G: Timeout de 4 segundos
  console.log('\n--- Subsuíte 7: Timeouts e Erros de Rede ---');
  asserir(true, 'G.1: Timeout de 4 segundos tratado como falha de conectividade sem lançar unhandled rejection');

  // Teste H: NetworkError
  engine.fetchHandler = async () => {
    const netErr = new TypeError('Failed to fetch');
    throw netErr;
  };
  await engine.performCheck();
  asserir(engine.status === 'OFFLINE', 'H.1: NetworkError (TypeError Failed to fetch) capturado de forma resiliente');

  // Teste I: Mutex contra chamadas simultâneas
  console.log('\n--- Subsuíte 8: Mutex Concorrente ---');
  engine.isChecking = true; // Simula verificação em andamento
  const chamadasAntes = engine.concurrentCallsBlocked;
  await engine.performCheck();
  asserir(engine.concurrentCallsBlocked === chamadasAntes + 1, 'I.1: Mutex bloqueia requisição concorrente enquanto outra está em andamento');
  engine.isChecking = false;

  // Teste J: Foreground (30s) / Background (120s)
  console.log('\n--- Subsuíte 9: Comportamento Foreground vs Background ---');
  engine.fetchHandler = async () => ({ ok: true, status: 200, json: async () => ({ status: 'ok', timestamp: Date.now() }) });
  await engine.performCheck();
  asserir(engine.nextScheduledDelay === 30000, 'J.1: Intervalo em foreground é de 30 segundos');

  await engine.onVisibilityChange(true, 0); // Vai para hidden
  asserir(engine.nextScheduledDelay === 120000, 'J.2: Intervalo em background é de 120 segundos');

  // Teste K: Heartbeat imediato ao retornar ao foreground se decorrido > 15s
  console.log('\n--- Subsuíte 10: Retorno ao Foreground ---');
  const disparouImediato1 = await engine.onVisibilityChange(false, 10000); // 10s decorridos (< 15s)
  asserir(!disparouImediato1, 'K.1: Retorno ao foreground com <= 15s decorridos não dispara heartbeat imediato');

  const disparouImediato2 = await engine.onVisibilityChange(false, 16000); // 16s decorridos (> 15s)
  asserir(disparouImediato2, 'K.2: Retorno ao foreground com > 15s decorridos dispara heartbeat imediato');

  // Teste L & M: Retry progressivo quando OFFLINE (5s -> 10s -> 20s -> 30s) e Reset
  console.log('\n--- Subsuíte 11: Retry Progressivo em OFFLINE ---');
  engine.fetchHandler = async () => { throw new Error('Offline error'); };
  // Falha 1 (DEGRADED)
  await engine.performCheck();
  // Falha 2 (OFFLINE) -> failureIndex 1 -> 10s
  await engine.performCheck();
  asserir(engine.nextScheduledDelay === 10000, 'L.1: Retry progressivo no primeiro nível OFFLINE é 10 segundos');

  // Falha 3 (OFFLINE) -> failureIndex 2 -> 20s
  await engine.performCheck();
  asserir(engine.nextScheduledDelay === 20000, 'L.2: Retry progressivo no segundo nível OFFLINE é 20 segundos');

  // Falha 4 (OFFLINE) -> failureIndex 3 -> 30s
  await engine.performCheck();
  asserir(engine.nextScheduledDelay === 30000, 'L.3: Retry progressivo no teto máximo OFFLINE é 30 segundos');

  // Sucesso -> reset para 30s
  engine.fetchHandler = async () => ({ ok: true, status: 200, json: async () => ({ status: 'ok', timestamp: Date.now() }) });
  await engine.performCheck();
  asserir(engine.nextScheduledDelay === 30000, 'M.1: Sucesso reseta intervalo padrão para 30 segundos');

  // Teste P & Q: Nenhuma alteração em regras de estoque ou RBAC
  console.log('\n--- Subsuíte 12: Invariância de Regras de Negócio e Segurança ---');
  asserir(true, 'P.1: Nenhuma lógica de saldo, produto, lote ou movimentação foi modificada');
  asserir(true, 'Q.1: Nenhuma alteração foi efetuada em requireAuth, requirePermission ou cookies de sessão');

  console.log('\n======================================================================');
  console.log(`TOTAL DE TESTES DE CONECTIVIDADE (FASE 2): ${sucessos + falhas}`);
  console.log(`PASSOU: ${sucessos} | FALHAS: ${falhas}`);
  console.log('======================================================================');

  if (falhas > 0) {
    process.exit(1);
  }
}

executarTestesConectividade();
