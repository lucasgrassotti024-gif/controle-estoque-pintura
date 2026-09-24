import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/session';
import { stockServerService } from '@/server/services/stock-server-service';
import { CriarProdutoDTO, AtualizarProdutoDTO } from '@/types/stock';

/**
 * ==============================================================================
 * ROUTE HANDLER: CADASTRO, EDIÇÃO E CONSULTA DE PRODUTOS (SERVER-SIDE)
 * ==============================================================================
 * GET: requireAuth (visualização de produtos para todos os papéis)
 * POST / PATCH: requirePermission('PRODUTO_GERENCIAR') (OPERADOR e ADMIN)
 */

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const codigo = searchParams.get('codigo');
    const dependenciasLote = searchParams.get('dependencias_lote');

    if (dependenciasLote) {
      const dependencias = await stockServerService.verificarDependenciasLote(dependenciasLote);
      return NextResponse.json(dependencias, { status: 200 });
    }

    if (id) {
      const produto = await stockServerService.buscarProdutoPorId(id);
      if (!produto) {
        return NextResponse.json({ erro: 'Produto não encontrado.' }, { status: 404 });
      }
      return NextResponse.json(produto, { status: 200 });
    }

    if (codigo) {
      const produto = await stockServerService.buscarProdutoPorCodigo(codigo);
      return NextResponse.json(produto, { status: 200 });
    }

    const termo = searchParams.get('termo') || undefined;
    const categoria = searchParams.get('categoria') as any || undefined;
    const apenas_ativos = searchParams.has('apenas_ativos')
      ? searchParams.get('apenas_ativos') === 'true'
      : undefined;
    const apenas_criticos = searchParams.get('apenas_criticos') === 'true';

    const produtos = await stockServerService.listarProdutos({
      termo,
      categoria,
      apenas_ativos,
      apenas_criticos,
    });

    return NextResponse.json(produtos, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { erro: error?.message || 'Erro ao consultar produtos.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'PRODUTO_GERENCIAR');
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  try {
    const body = await req.json();

    const dto: CriarProdutoDTO = {
      codigo: String(body.codigo || ''),
      nome: String(body.nome || ''),
      descricao: body.descricao ? String(body.descricao) : undefined,
      categoria: body.categoria,
      unidade_medida: body.unidade_medida,
      fabricante: body.fabricante ? String(body.fabricante) : undefined,
      localizacao: body.localizacao ? String(body.localizacao) : undefined,
      controla_lote: Boolean(body.controla_lote),
      estoque_minimo: Number(body.estoque_minimo ?? 0),
      estoque_maximo: Number(body.estoque_maximo ?? 0),
    };

    const produto = await stockServerService.criarProduto(dto);
    return NextResponse.json(produto, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { erro: error?.message || 'Erro ao cadastrar produto.' },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requirePermission(req, 'PRODUTO_GERENCIAR');
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  try {
    const body = await req.json();
    const id = String(body.id || '');

    if (!id) {
      return NextResponse.json({ erro: 'ID do produto é obrigatório.' }, { status: 400 });
    }

    if (body.ativo !== undefined && Object.keys(body).length <= 2) {
      // Alteração isolada de status ativo/inativo
      const produto = await stockServerService.alterarStatusAtivo(id, Boolean(body.ativo));
      return NextResponse.json(produto, { status: 200 });
    }

    const dto: AtualizarProdutoDTO = {
      codigo: body.codigo ? String(body.codigo) : undefined,
      nome: body.nome ? String(body.nome) : undefined,
      descricao: body.descricao !== undefined ? body.descricao : undefined,
      categoria: body.categoria,
      unidade_medida: body.unidade_medida,
      fabricante: body.fabricante !== undefined ? body.fabricante : undefined,
      localizacao: body.localizacao !== undefined ? body.localizacao : undefined,
      controla_lote: body.controla_lote !== undefined ? Boolean(body.controla_lote) : undefined,
      estoque_minimo: body.estoque_minimo !== undefined ? Number(body.estoque_minimo) : undefined,
      estoque_maximo: body.estoque_maximo !== undefined ? Number(body.estoque_maximo) : undefined,
      ativo: body.ativo !== undefined ? Boolean(body.ativo) : undefined,
    };

    const produto = await stockServerService.atualizarProduto(id, dto);
    return NextResponse.json(produto, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { erro: error?.message || 'Erro ao atualizar produto.' },
      { status: 400 }
    );
  }
}

