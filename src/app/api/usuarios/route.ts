import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/auth/session';
import { stockServerService } from '@/server/services/stock-server-service';
import { CriarUsuarioDTO, AtualizarUsuarioDTO } from '@/types/stock';

/**
 * ==============================================================================
 * ROUTE HANDLER: GERENCIAMENTO DE USUÁRIOS (SERVER-SIDE)
 * ==============================================================================
 * /api/usuarios
 * Exclusivo perfil ADMIN (requirePermission 'USUARIO_GERENCIAR').
 * 
 * GET: Lista todos os usuários.
 * POST: Cria novo usuário no Firebase Auth + Firestore.
 * PATCH: Atualiza nome, papel ou ativação (ativo: true/false).
 */

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'USUARIO_GERENCIAR');
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  try {
    const usuarios = await stockServerService.listarUsuarios();
    return NextResponse.json(usuarios, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { erro: error?.message || 'Erro ao listar usuários.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'USUARIO_GERENCIAR');
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  try {
    const body = await req.json();

    const dto: CriarUsuarioDTO = {
      email: String(body.email || ''),
      nome: String(body.nome || ''),
      senha: String(body.senha || ''),
      papel: body.papel,
    };

    const novoUsuario = await stockServerService.criarUsuario(dto);
    return NextResponse.json(novoUsuario, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { erro: error?.message || 'Erro ao cadastrar usuário.' },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requirePermission(req, 'USUARIO_GERENCIAR');
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  try {
    const body = await req.json();
    const uid = body.uid || body.id;

    if (!uid) {
      return NextResponse.json({ erro: 'UID do usuário é obrigatório.' }, { status: 400 });
    }

    const dto: AtualizarUsuarioDTO = {};
    if (typeof body.nome === 'string') {
      dto.nome = body.nome;
    }
    if (body.papel) {
      dto.papel = body.papel;
    }
    if (typeof body.ativo === 'boolean') {
      dto.ativo = body.ativo;
    }

    const usuarioAtualizado = await stockServerService.atualizarUsuario(uid, dto);
    return NextResponse.json(usuarioAtualizado, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { erro: error?.message || 'Erro ao atualizar usuário.' },
      { status: 400 }
    );
  }
}
