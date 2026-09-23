-- ==============================================================================
-- SISTEMA DE CONTROLE DE ESTOQUE - MIGRATION INICIAL V1
-- Regra Fundamental: Saldo estritamente NÃO-NEGATIVO, histórico imutável (Ledger)
-- e transações atômicas com Lock Pessimista (SELECT ... FOR UPDATE).
-- ==============================================================================

-- 1. Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabela de Usuários / Perfis
CREATE TABLE IF NOT EXISTS public.usuarios (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    papel TEXT NOT NULL CHECK (papel IN ('ADMIN', 'GESTOR', 'OPERADOR', 'CONSULTA')) DEFAULT 'OPERADOR',
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Tabela de Produtos / Materiais (Estoque Único V1)
CREATE TABLE IF NOT EXISTS public.produtos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    descricao TEXT,
    categoria TEXT NOT NULL,
    unidade_medida TEXT NOT NULL, -- UN, KG, L, M, M2, etc.
    fabricante TEXT,
    localizacao TEXT, -- Localização física fixa (ex: Prateleira B-3)
    controla_lote BOOLEAN NOT NULL DEFAULT FALSE,
    estoque_minimo NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (estoque_minimo >= 0),
    estoque_maximo NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (estoque_maximo >= 0),
    saldo_atual NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (saldo_atual >= 0), -- REGRA 1: Proibido saldo negativo
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Tabela de Lotes (Opcional por produto)
CREATE TABLE IF NOT EXISTS public.lotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
    numero_lote TEXT NOT NULL,
    data_fabricacao DATE,
    data_validade DATE,
    saldo_lote NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (saldo_lote >= 0),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_produto_lote UNIQUE (produto_id, numero_lote)
);

-- 5. Livro-Razão de Movimentações (Ledger Imutável)
CREATE TABLE IF NOT EXISTS public.movimentacoes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
    lote_id UUID REFERENCES public.lotes(id) ON DELETE RESTRICT,
    tipo TEXT NOT NULL CHECK (tipo IN ('ENTRADA', 'SAIDA', 'AJUSTE_ENTRADA', 'AJUSTE_SAIDA', 'CONFERENCIA_FISICA')),
    quantidade NUMERIC(12, 3) NOT NULL CHECK (quantidade > 0),
    saldo_anterior NUMERIC(12, 3) NOT NULL,
    saldo_posterior NUMERIC(12, 3) NOT NULL CHECK (saldo_posterior >= 0),
    documento_ref TEXT,
    motivo_destino TEXT,
    justificativa TEXT,
    observacao TEXT,
    usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Histórico Dedicado de Conferências Físicas
CREATE TABLE IF NOT EXISTS public.conferencias_fisicas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
    lote_id UUID REFERENCES public.lotes(id) ON DELETE RESTRICT,
    quantidade_anterior NUMERIC(12, 3) NOT NULL,
    quantidade_encontrada NUMERIC(12, 3) NOT NULL CHECK (quantidade_encontrada >= 0),
    diferenca NUMERIC(12, 3) NOT NULL, -- quantidade_encontrada - quantidade_anterior
    justificativa TEXT,
    observacao TEXT,
    realizado_por UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Índices para performance e consultas rápidas
CREATE INDEX IF NOT EXISTS idx_produtos_codigo ON public.produtos(codigo);
CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON public.produtos(categoria);
CREATE INDEX IF NOT EXISTS idx_produtos_ativo ON public.produtos(ativo);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_produto_id ON public.movimentacoes(produto_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_criado_em ON public.movimentacoes(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_conferencias_produto_id ON public.conferencias_fisicas(produto_id);

-- ==============================================================================
-- 8. FUNÇÕES ATÔMICAS DE BANCO (RPC) COM LOCK TRANSACIONAL (SELECT ... FOR UPDATE)
-- ==============================================================================

-- 8.1 REGISTRAR ENTRADA ATÔMICA
CREATE OR REPLACE FUNCTION public.registrar_entrada(
    p_produto_id UUID,
    p_quantidade NUMERIC(12, 3),
    p_documento_ref TEXT,
    p_motivo_destino TEXT,
    p_observacao TEXT,
    p_usuario_id UUID,
    p_numero_lote TEXT DEFAULT NULL,
    p_data_validade DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_saldo_ant NUMERIC(12, 3);
    v_saldo_pos NUMERIC(12, 3);
    v_lote_id UUID := NULL;
    v_mov_id UUID;
BEGIN
    IF p_quantidade <= 0 THEN
        RAISE EXCEPTION 'A quantidade de entrada deve ser maior que zero.';
    END IF;

    -- Lock pessimista no produto para concorrência segura
    SELECT saldo_atual INTO v_saldo_ant
    FROM public.produtos
    WHERE id = p_produto_id AND ativo = TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado ou inativo.';
    END IF;

    -- Gerenciamento opcional de lote
    IF p_numero_lote IS NOT NULL AND TRIM(p_numero_lote) <> '' THEN
        SELECT id INTO v_lote_id FROM public.lotes 
        WHERE produto_id = p_produto_id AND numero_lote = p_numero_lote;

        IF v_lote_id IS NULL THEN
            INSERT INTO public.lotes (produto_id, numero_lote, data_validade, saldo_lote)
            VALUES (p_produto_id, p_numero_lote, p_data_validade, p_quantidade)
            RETURNING id INTO v_lote_id;
        ELSE
            UPDATE public.lotes 
            SET saldo_lote = saldo_lote + p_quantidade
            WHERE id = v_lote_id;
        END IF;
    END IF;

    v_saldo_pos := v_saldo_ant + p_quantidade;

    -- Atualiza saldo consolidado do produto
    UPDATE public.produtos
    SET saldo_atual = v_saldo_pos,
        atualizado_em = NOW()
    WHERE id = p_produto_id;

    -- Registra movimentação no livro-razão (imutável)
    INSERT INTO public.movimentacoes (
        produto_id, lote_id, tipo, quantidade,
        saldo_anterior, saldo_posterior,
        documento_ref, motivo_destino, observacao, usuario_id
    ) VALUES (
        p_produto_id, v_lote_id, 'ENTRADA', p_quantidade,
        v_saldo_ant, v_saldo_pos,
        p_documento_ref, p_motivo_destino, p_observacao, p_usuario_id
    )
    RETURNING id INTO v_mov_id;

    RETURN jsonb_build_object(
        'sucesso', true,
        'movimentacao_id', v_mov_id,
        'saldo_anterior', v_saldo_ant,
        'saldo_posterior', v_saldo_pos
    );
END;
$$;


-- 8.2 REGISTRAR SAÍDA ATÔMICA (BLOQUEIA SALDO NEGATIVO)
CREATE OR REPLACE FUNCTION public.registrar_saida(
    p_produto_id UUID,
    p_quantidade NUMERIC(12, 3),
    p_documento_ref TEXT,
    p_motivo_destino TEXT,
    p_observacao TEXT,
    p_usuario_id UUID,
    p_lote_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_saldo_ant NUMERIC(12, 3);
    v_saldo_pos NUMERIC(12, 3);
    v_mov_id UUID;
    v_saldo_lote NUMERIC(12, 3);
BEGIN
    IF p_quantidade <= 0 THEN
        RAISE EXCEPTION 'A quantidade de saída deve ser maior que zero.';
    END IF;

    -- Lock pessimista no produto
    SELECT saldo_atual INTO v_saldo_ant
    FROM public.produtos
    WHERE id = p_produto_id AND ativo = TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado ou inativo.';
    END IF;

    -- REGRA FUNDAMENTAL: Proibido saldo negativo
    IF v_saldo_ant < p_quantidade THEN
        RAISE EXCEPTION 'Saldo insuficiente. Saldo atual disponível: %, Saída solicitada: %', v_saldo_ant, p_quantidade;
    END IF;

    -- Verificação de lote, se especificado
    IF p_lote_id IS NOT NULL THEN
        SELECT saldo_lote INTO v_saldo_lote
        FROM public.lotes
        WHERE id = p_lote_id AND produto_id = p_produto_id
        FOR UPDATE;

        IF v_saldo_lote < p_quantidade THEN
            RAISE EXCEPTION 'Saldo insuficiente no lote especificado. Disponível no lote: %, Saída: %', v_saldo_lote, p_quantidade;
        END IF;

        UPDATE public.lotes
        SET saldo_lote = saldo_lote - p_quantidade
        WHERE id = p_lote_id;
    END IF;

    v_saldo_pos := v_saldo_ant - p_quantidade;

    -- Atualiza produto
    UPDATE public.produtos
    SET saldo_atual = v_saldo_pos,
        atualizado_em = NOW()
    WHERE id = p_produto_id;

    -- Registra saída no histórico
    INSERT INTO public.movimentacoes (
        produto_id, lote_id, tipo, quantidade,
        saldo_anterior, saldo_posterior,
        documento_ref, motivo_destino, observacao, usuario_id
    ) VALUES (
        p_produto_id, p_lote_id, 'SAIDA', p_quantidade,
        v_saldo_ant, v_saldo_pos,
        p_documento_ref, p_motivo_destino, p_observacao, p_usuario_id
    )
    RETURNING id INTO v_mov_id;

    RETURN jsonb_build_object(
        'sucesso', true,
        'movimentacao_id', v_mov_id,
        'saldo_anterior', v_saldo_ant,
        'saldo_posterior', v_saldo_pos
    );
END;
$$;


-- 8.3 REGISTRAR CONFERÊNCIA FÍSICA (ESTOQUE FÍSICO COMO AUTORIDADE)
CREATE OR REPLACE FUNCTION public.registrar_conferencia_fisica(
    p_produto_id UUID,
    p_quantidade_encontrada NUMERIC(12, 3),
    p_justificativa TEXT,
    p_observacao TEXT,
    p_usuario_id UUID,
    p_lote_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_saldo_ant NUMERIC(12, 3);
    v_saldo_pos NUMERIC(12, 3);
    v_diferenca NUMERIC(12, 3);
    v_tipo_ajuste TEXT;
    v_qtd_ajuste NUMERIC(12, 3);
    v_mov_id UUID := NULL;
    v_conf_id UUID;
BEGIN
    IF p_quantidade_encontrada < 0 THEN
        RAISE EXCEPTION 'A quantidade encontrada na conferência não pode ser negativa.';
    END IF;

    -- Lock pessimista no produto
    SELECT saldo_atual INTO v_saldo_ant
    FROM public.produtos
    WHERE id = p_produto_id AND ativo = TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado ou inativo.';
    END IF;

    v_saldo_pos := p_quantidade_encontrada;
    v_diferenca := v_saldo_pos - v_saldo_ant;

    -- 1. Registra o evento na tabela dedicada de conferências físicas
    INSERT INTO public.conferencias_fisicas (
        produto_id, lote_id, quantidade_anterior,
        quantidade_encontrada, diferenca,
        justificativa, observacao, realizado_por
    ) VALUES (
        p_produto_id, p_lote_id, v_saldo_ant,
        v_saldo_pos, v_diferenca,
        p_justificativa, p_observacao, p_usuario_id
    )
    RETURNING id INTO v_conf_id;

    -- 2. Se houver diferença entre a contagem física e o sistema, gera movimentação de ajuste compensatório
    IF v_diferenca <> 0 THEN
        IF v_diferenca > 0 THEN
            v_tipo_ajuste := 'AJUSTE_ENTRADA';
            v_qtd_ajuste := v_diferenca;
        ELSE
            v_tipo_ajuste := 'AJUSTE_SAIDA';
            v_qtd_ajuste := ABS(v_diferenca);
        END IF;

        -- Insere no histórico geral com identificação clara
        INSERT INTO public.movimentacoes (
            produto_id, lote_id, tipo, quantidade,
            saldo_anterior, saldo_posterior,
            motivo_destino, justificativa, observacao, usuario_id
        ) VALUES (
            p_produto_id, p_lote_id, v_tipo_ajuste, v_qtd_ajuste,
            v_saldo_ant, v_saldo_pos,
            'Ajuste por Conferência Física', p_justificativa, p_observacao, p_usuario_id
        )
        RETURNING id INTO v_mov_id;
    END IF;

    -- 3. Atualiza o saldo do produto para a autoridade física encontrada
    UPDATE public.produtos
    SET saldo_atual = v_saldo_pos,
        atualizado_em = NOW()
    WHERE id = p_produto_id;

    RETURN jsonb_build_object(
        'sucesso', true,
        'conferencia_id', v_conf_id,
        'movimentacao_id', v_mov_id,
        'saldo_anterior', v_saldo_ant,
        'saldo_posterior', v_saldo_pos,
        'diferenca', v_diferenca
    );
END;
$$;
