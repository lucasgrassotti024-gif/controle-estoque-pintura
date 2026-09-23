-- ==============================================================================
-- SISTEMA DE CONTROLE DE ESTOQUE - FASE 9: BLINDAGEM DE AUTORIZAÇÃO NAS RPCS
-- ==============================================================================
-- Migration incremental para formalizar a autorização dos 4 papéis do sistema:
-- ADMIN, GESTOR, OPERADOR, CONSULTA.
-- Garante que:
-- 1. Usuários inativos (ativo = FALSE) sejam terminantemente bloqueados.
-- 2. Usuários com papel CONSULTA sejam bloqueados de invocar registrar_entrada,
--    registrar_saida ou registrar_conferencia_fisica.
-- 3. A identidade e papel do usuário sejam obtidos exclusivamente via auth.uid().
-- ==============================================================================

-- 1. ATUALIZAÇÃO DA RPC REGISTRAR ENTRADA
CREATE OR REPLACE FUNCTION public.registrar_entrada(
    p_produto_id UUID,
    p_quantidade NUMERIC(12, 3),
    p_documento_ref TEXT DEFAULT NULL,
    p_motivo_destino TEXT DEFAULT NULL,
    p_observacao TEXT DEFAULT NULL,
    p_numero_lote TEXT DEFAULT NULL,
    p_data_validade DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_usuario_id UUID;
    v_papel_usuario TEXT;
    v_usuario_ativo BOOLEAN;
    v_controla_lote BOOLEAN;
    v_saldo_ant NUMERIC(12, 3);
    v_saldo_pos NUMERIC(12, 3);
    v_lote_id UUID := NULL;
    v_mov_id UUID;
BEGIN
    -- 1. Validação de Usuário Autenticado via auth.uid()
    v_usuario_id := auth.uid();
    IF v_usuario_id IS NULL THEN
        RAISE EXCEPTION 'Operação não permitida: usuário não autenticado.';
    END IF;

    -- 2. Verificação de Perfil e Status Ativo na Tabela usuarios
    SELECT papel, ativo 
    INTO v_papel_usuario, v_usuario_ativo
    FROM public.usuarios
    WHERE id = v_usuario_id;

    IF v_papel_usuario IS NULL OR v_usuario_ativo = FALSE THEN
        RAISE EXCEPTION 'Operação não permitida: usuário inativo ou não cadastrado no sistema.';
    END IF;

    IF v_papel_usuario = 'CONSULTA' THEN
        RAISE EXCEPTION 'Acesso negado: perfil de apenas CONSULTA não possui permissão para movimentar o estoque.';
    END IF;

    -- 3. Validação da Quantidade
    IF p_quantidade <= 0 THEN
        RAISE EXCEPTION 'A quantidade de entrada deve ser maior que zero.';
    END IF;

    -- 4. Lock Pessimista no Produto
    SELECT saldo_atual, controla_lote 
    INTO v_saldo_ant, v_controla_lote
    FROM public.produtos
    WHERE id = p_produto_id AND ativo = TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado ou inativo.';
    END IF;

    -- 5. Regras de Lote
    IF v_controla_lote = TRUE THEN
        IF p_numero_lote IS NULL OR TRIM(p_numero_lote) = '' THEN
            RAISE EXCEPTION 'Lote obrigatório: este produto exige identificação de lote para entrada.';
        END IF;

        -- Busca lote existente ou cria novo
        SELECT id INTO v_lote_id 
        FROM public.lotes 
        WHERE produto_id = p_produto_id AND numero_lote = TRIM(p_numero_lote)
        FOR UPDATE;

        IF v_lote_id IS NULL THEN
            INSERT INTO public.lotes (produto_id, numero_lote, data_validade, saldo_lote)
            VALUES (p_produto_id, TRIM(p_numero_lote), p_data_validade, p_quantidade)
            RETURNING id INTO v_lote_id;
        ELSE
            UPDATE public.lotes 
            SET saldo_lote = saldo_lote + p_quantidade,
                data_validade = COALESCE(p_data_validade, data_validade)
            WHERE id = v_lote_id;
        END IF;
    ELSE
        -- Produto sem controle de lote não deve receber número de lote
        IF p_numero_lote IS NOT NULL AND TRIM(p_numero_lote) <> '' THEN
            RAISE EXCEPTION 'Este produto não controla lote. O campo de lote deve permanecer vazio.';
        END IF;
    END IF;

    v_saldo_pos := v_saldo_ant + p_quantidade;

    -- 6. Atualização de saldo com bypass da proteção para execução legítima de RPC
    PERFORM set_config('app.permitir_alteracao_saldo', 'true', true);

    UPDATE public.produtos
    SET saldo_atual = v_saldo_pos,
        atualizado_em = NOW()
    WHERE id = p_produto_id;

    -- 7. Registro no Ledger Imutável
    INSERT INTO public.movimentacoes (
        produto_id, lote_id, tipo, quantidade,
        saldo_anterior, saldo_posterior,
        documento_ref, motivo_destino, observacao, usuario_id
    ) VALUES (
        p_produto_id, v_lote_id, 'ENTRADA', p_quantidade,
        v_saldo_ant, v_saldo_pos,
        p_documento_ref, p_motivo_destino, p_observacao, v_usuario_id
    )
    RETURNING id INTO v_mov_id;

    RETURN jsonb_build_object(
        'sucesso', true,
        'movimentacao_id', v_mov_id,
        'saldo_anterior', v_saldo_ant,
        'saldo_posterior', v_saldo_pos,
        'lote_id', v_lote_id
    );
END;
$$;


-- 2. ATUALIZAÇÃO DA RPC REGISTRAR SAÍDA
CREATE OR REPLACE FUNCTION public.registrar_saida(
    p_produto_id UUID,
    p_quantidade NUMERIC(12, 3),
    p_documento_ref TEXT DEFAULT NULL,
    p_motivo_destino TEXT DEFAULT NULL,
    p_observacao TEXT DEFAULT NULL,
    p_lote_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_usuario_id UUID;
    v_papel_usuario TEXT;
    v_usuario_ativo BOOLEAN;
    v_controla_lote BOOLEAN;
    v_saldo_ant NUMERIC(12, 3);
    v_saldo_pos NUMERIC(12, 3);
    v_saldo_lote NUMERIC(12, 3);
    v_lote_produto_id UUID;
    v_mov_id UUID;
BEGIN
    -- 1. Validação de Usuário Autenticado via auth.uid()
    v_usuario_id := auth.uid();
    IF v_usuario_id IS NULL THEN
        RAISE EXCEPTION 'Operação não permitida: usuário não autenticado.';
    END IF;

    -- 2. Verificação de Perfil e Status Ativo na Tabela usuarios
    SELECT papel, ativo 
    INTO v_papel_usuario, v_usuario_ativo
    FROM public.usuarios
    WHERE id = v_usuario_id;

    IF v_papel_usuario IS NULL OR v_usuario_ativo = FALSE THEN
        RAISE EXCEPTION 'Operação não permitida: usuário inativo ou não cadastrado no sistema.';
    END IF;

    IF v_papel_usuario = 'CONSULTA' THEN
        RAISE EXCEPTION 'Acesso negado: perfil de apenas CONSULTA não possui permissão para movimentar o estoque.';
    END IF;

    -- 3. Validação da Quantidade
    IF p_quantidade <= 0 THEN
        RAISE EXCEPTION 'A quantidade de saída deve ser maior que zero.';
    END IF;

    -- 4. Lock Pessimista no Produto
    SELECT saldo_atual, controla_lote 
    INTO v_saldo_ant, v_controla_lote
    FROM public.produtos
    WHERE id = p_produto_id AND ativo = TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado ou inativo.';
    END IF;

    -- 5. Validação Geral de Saldo Consolidado (Proibido Saldo Negativo)
    IF v_saldo_ant < p_quantidade THEN
        RAISE EXCEPTION 'Saldo insuficiente no produto. Saldo disponível: %, Saída solicitada: %', v_saldo_ant, p_quantidade;
    END IF;

    -- 6. Validação Específica de Lote
    IF v_controla_lote = TRUE THEN
        IF p_lote_id IS NULL THEN
            RAISE EXCEPTION 'Lote obrigatório: este produto controla lote. Selecione manualmente o lote de origem.';
        END IF;

        -- Lock Pessimista no Lote e verificação de pertencimento
        SELECT produto_id, saldo_lote 
        INTO v_lote_produto_id, v_saldo_lote
        FROM public.lotes
        WHERE id = p_lote_id AND ativo = TRUE
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Lote não encontrado ou inativo.';
        END IF;

        IF v_lote_produto_id <> p_produto_id THEN
            RAISE EXCEPTION 'Inconsistência: o lote informado não pertence a este produto.';
        END IF;

        IF v_saldo_lote < p_quantidade THEN
            RAISE EXCEPTION 'Saldo insuficiente no lote selecionado. Disponível no lote: %, Saída solicitada: %', v_saldo_lote, p_quantidade;
        END IF;

        -- Debita o lote
        UPDATE public.lotes
        SET saldo_lote = saldo_lote - p_quantidade
        WHERE id = p_lote_id;
    ELSE
        -- Produto sem controle de lote não aceita lote_id
        IF p_lote_id IS NOT NULL THEN
            RAISE EXCEPTION 'Este produto não controla lote. Parâmetro de lote deve ser nulo.';
        END IF;
    END IF;

    v_saldo_pos := v_saldo_ant - p_quantidade;

    -- 7. Atualização de Saldo Consolidado com bypass de segurança para RPC
    PERFORM set_config('app.permitir_alteracao_saldo', 'true', true);

    UPDATE public.produtos
    SET saldo_atual = v_saldo_pos,
        atualizado_em = NOW()
    WHERE id = p_produto_id;

    -- 8. Registro no Ledger Imutável
    INSERT INTO public.movimentacoes (
        produto_id, lote_id, tipo, quantidade,
        saldo_anterior, saldo_posterior,
        documento_ref, motivo_destino, observacao, usuario_id
    ) VALUES (
        p_produto_id, p_lote_id, 'SAIDA', p_quantidade,
        v_saldo_ant, v_saldo_pos,
        p_documento_ref, p_motivo_destino, p_observacao, v_usuario_id
    )
    RETURNING id INTO v_mov_id;

    RETURN jsonb_build_object(
        'sucesso', true,
        'movimentacao_id', v_mov_id,
        'saldo_anterior', v_saldo_ant,
        'saldo_posterior', v_saldo_pos,
        'lote_id', p_lote_id
    );
END;
$$;


-- 3. ATUALIZAÇÃO DA RPC REGISTRAR CONFERÊNCIA FÍSICA
CREATE OR REPLACE FUNCTION public.registrar_conferencia_fisica(
    p_produto_id UUID,
    p_quantidade_encontrada NUMERIC(12, 3),
    p_justificativa TEXT DEFAULT NULL,
    p_observacao TEXT DEFAULT NULL,
    p_lote_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_usuario_id UUID;
    v_papel_usuario TEXT;
    v_usuario_ativo BOOLEAN;
    v_controla_lote BOOLEAN;
    v_saldo_ant NUMERIC(12, 3);
    v_saldo_pos NUMERIC(12, 3);
    v_saldo_ant_lote NUMERIC(12, 3);
    v_diferenca NUMERIC(12, 3);
    v_tipo_ajuste TEXT;
    v_qtd_ajuste NUMERIC(12, 3);
    v_lote_produto_id UUID;
    v_mov_id UUID := NULL;
    v_conf_id UUID;
BEGIN
    -- 1. Validação de Usuário Autenticado via auth.uid()
    v_usuario_id := auth.uid();
    IF v_usuario_id IS NULL THEN
        RAISE EXCEPTION 'Operação não permitida: usuário não autenticado.';
    END IF;

    -- 2. Verificação de Perfil e Status Ativo na Tabela usuarios
    SELECT papel, ativo 
    INTO v_papel_usuario, v_usuario_ativo
    FROM public.usuarios
    WHERE id = v_usuario_id;

    IF v_papel_usuario IS NULL OR v_usuario_ativo = FALSE THEN
        RAISE EXCEPTION 'Operação não permitida: usuário inativo ou não cadastrado no sistema.';
    END IF;

    IF v_papel_usuario = 'CONSULTA' THEN
        RAISE EXCEPTION 'Acesso negado: perfil de apenas CONSULTA não possui permissão para movimentar o estoque.';
    END IF;

    -- 3. Validação da Quantidade Encontrada
    IF p_quantidade_encontrada < 0 THEN
        RAISE EXCEPTION 'A quantidade encontrada na conferência física não pode ser negativa.';
    END IF;

    -- 4. Lock Pessimista no Produto
    SELECT saldo_atual, controla_lote 
    INTO v_saldo_ant, v_controla_lote
    FROM public.produtos
    WHERE id = p_produto_id AND ativo = TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado ou inativo.';
    END IF;

    -- 5. Tratamento por Modalidade de Controle de Lote
    IF v_controla_lote = TRUE THEN
        IF p_lote_id IS NULL THEN
            RAISE EXCEPTION 'Lote obrigatório: a conferência de produto com controle de lote deve ser realizada lote por lote.';
        END IF;

        -- Lock Pessimista no Lote
        SELECT produto_id, saldo_lote 
        INTO v_lote_produto_id, v_saldo_ant_lote
        FROM public.lotes
        WHERE id = p_lote_id AND ativo = TRUE
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Lote não encontrado ou inativo.';
        END IF;

        IF v_lote_produto_id <> p_produto_id THEN
            RAISE EXCEPTION 'Inconsistência: o lote informado não pertence a este produto.';
        END IF;

        -- Cálculo da divergência no lote
        v_diferenca := p_quantidade_encontrada - v_saldo_ant_lote;
        v_saldo_pos := v_saldo_ant + v_diferenca;

        -- Validação de integridade do produto
        IF v_saldo_pos < 0 THEN
            RAISE EXCEPTION 'Erro crítico de integridade: o ajuste do lote resultaria em saldo consolidado negativo (%) para o produto.', v_saldo_pos;
        END IF;

        -- Atualiza lote para a quantidade física encontrada
        UPDATE public.lotes
        SET saldo_lote = p_quantidade_encontrada
        WHERE id = p_lote_id;

        -- Registra na tabela dedicada de conferências físicas
        INSERT INTO public.conferencias_fisicas (
            produto_id, lote_id, quantidade_anterior,
            quantidade_encontrada, diferenca,
            justificativa, observacao, realizado_por
        ) VALUES (
            p_produto_id, p_lote_id, v_saldo_ant_lote,
            p_quantidade_encontrada, v_diferenca,
            p_justificativa, p_observacao, v_usuario_id
        )
        RETURNING id INTO v_conf_id;

    ELSE
        -- Produto sem lote: conferência no saldo consolidado
        IF p_lote_id IS NOT NULL THEN
            RAISE EXCEPTION 'Este produto não controla lote. Parâmetro de lote deve ser nulo.';
        END IF;

        v_saldo_pos := p_quantidade_encontrada;
        v_diferenca := v_saldo_pos - v_saldo_ant;

        INSERT INTO public.conferencias_fisicas (
            produto_id, lote_id, quantidade_anterior,
            quantidade_encontrada, diferenca,
            justificativa, observacao, realizado_por
        ) VALUES (
            p_produto_id, NULL, v_saldo_ant,
            p_quantidade_encontrada, v_diferenca,
            p_justificativa, p_observacao, v_usuario_id
        )
        RETURNING id INTO v_conf_id;
    END IF;

    -- 6. Se houver divergência, gera registro de ajuste no Ledger Imutável
    IF v_diferenca <> 0 THEN
        IF p_justificativa IS NULL OR TRIM(p_justificativa) = '' THEN
            RAISE EXCEPTION 'Justificativa obrigatória: qualquer ajuste com divergência de conferência física exige justificativa.';
        END IF;

        IF v_diferenca > 0 THEN
            v_tipo_ajuste := 'AJUSTE_ENTRADA';
            v_qtd_ajuste := v_diferenca;
        ELSE
            v_tipo_ajuste := 'AJUSTE_SAIDA';
            v_qtd_ajuste := ABS(v_diferenca);
        END IF;

        INSERT INTO public.movimentacoes (
            produto_id, lote_id, tipo, quantidade,
            saldo_anterior, saldo_posterior,
            motivo_destino, justificativa, observacao, usuario_id
        ) VALUES (
            p_produto_id, p_lote_id, v_tipo_ajuste, v_qtd_ajuste,
            v_saldo_ant, v_saldo_pos,
            'Ajuste por Conferência Física', p_justificativa, p_observacao, v_usuario_id
        )
        RETURNING id INTO v_mov_id;
    END IF;

    -- 7. Atualização atômica do saldo do produto com bypass para RPC
    PERFORM set_config('app.permitir_alteracao_saldo', 'true', true);

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
        'diferenca', v_diferenca,
        'lote_id', p_lote_id
    );
END;
$$;
