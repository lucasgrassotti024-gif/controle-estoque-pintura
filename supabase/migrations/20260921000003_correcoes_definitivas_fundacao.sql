-- ==============================================================================
-- SISTEMA DE CONTROLE DE ESTOQUE - MIGRATION 003: CORREÇÕES DEFINITIVAS DA FUNDAÇÃO
-- 1. Remoção de RPCs inseguras com p_usuario_id
-- 2. Uso estrito de auth.uid() para identificação do responsável
-- 3. Proteção física de produtos.saldo_atual contra UPDATE direto de clientes
-- 4. Triggers de imutabilidade estrita (append-only) em movimentacoes e conferencias_fisicas
-- 5. Regras rígidas de Lotes: entrada, saída e conferência obrigatórias quando controla_lote = TRUE
-- 6. Invariância produtos.saldo_atual = SUM(lotes.saldo_lote)
-- 7. CHECK constraints para Categorias e Unidades de Medida da V1
-- ==============================================================================

-- 1. DROP DAS VERSÕES ANTIGAS DAS RPCS PARA NÃO DEIXAR PORTAS INSEGURAS
DROP FUNCTION IF EXISTS public.registrar_entrada(UUID, NUMERIC, TEXT, TEXT, TEXT, UUID, TEXT, DATE);
DROP FUNCTION IF EXISTS public.registrar_saida(UUID, NUMERIC, TEXT, TEXT, TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS public.registrar_conferencia_fisica(UUID, NUMERIC, TEXT, TEXT, UUID, UUID);

-- 2. CHECK CONSTRAINTS PARA CATEGORIAS E UNIDADES DE MEDIDA V1
ALTER TABLE public.produtos
    ADD CONSTRAINT chk_produtos_categoria 
    CHECK (categoria IN ('Tintas', 'Solventes', 'Abrasivos', 'EPIs', 'Embalagens', 'Outros'));

ALTER TABLE public.produtos
    ADD CONSTRAINT chk_produtos_unidade_medida 
    CHECK (unidade_medida IN ('UN', 'KG', 'G', 'L', 'ML', 'M', 'M²', 'M³', 'CX', 'SC'));

-- 3. IMUTABILIDADE DO HISTÓRICO: TRIGGERS CONTRA UPDATE E DELETE
CREATE OR REPLACE FUNCTION public.trg_bloquear_modificacao_historico()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Operação não permitida: registros históricos são estritamente imutáveis (append-only).';
END;
$$;

DROP TRIGGER IF EXISTS trg_movimentacoes_imutavel ON public.movimentacoes;
CREATE TRIGGER trg_movimentacoes_imutavel
BEFORE UPDATE OR DELETE ON public.movimentacoes
FOR EACH ROW
EXECUTE FUNCTION public.trg_bloquear_modificacao_historico();

DROP TRIGGER IF EXISTS trg_conferencias_imutavel ON public.conferencias_fisicas;
CREATE TRIGGER trg_conferencias_imutavel
BEFORE UPDATE OR DELETE ON public.conferencias_fisicas
FOR EACH ROW
EXECUTE FUNCTION public.trg_bloquear_modificacao_historico();

-- 4. PROTEÇÃO DE PRODUTOS.SALDO_ATUAL CONTRA UPDATE DIRETO DO CLIENTE
-- Permite que gestores e admins alterem dados cadastrais, mas impede alteração direta de saldo_atual
CREATE OR REPLACE FUNCTION public.trg_bloquear_alteracao_direta_saldo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Se saldo_atual foi modificado e a execução não for via RPC com flag de bypass de sistema
    IF NEW.saldo_atual IS DISTINCT FROM OLD.saldo_atual THEN
        IF current_setting('app.permitir_alteracao_saldo', true) IS DISTINCT FROM 'true' THEN
            RAISE EXCEPTION 'A coluna saldo_atual não pode ser alterada diretamente. Utilize as funções transacionais de movimentação/conferência.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_saldo_produto ON public.produtos;
CREATE TRIGGER trg_proteger_saldo_produto
BEFORE UPDATE ON public.produtos
FOR EACH ROW
EXECUTE FUNCTION public.trg_bloquear_alteracao_direta_saldo();

-- 5. RECONSTRUÇÃO DAS RPCS DEFINITIVAS COM AUTH.UID() E REGRAS DE LOTE E INVARIÂNCIA

-- 5.1 REGISTRAR ENTRADA DEFINITIVA
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

    -- 2. Validação da Quantidade
    IF p_quantidade <= 0 THEN
        RAISE EXCEPTION 'A quantidade de entrada deve ser maior que zero.';
    END IF;

    -- 3. Lock Pessimista no Produto
    SELECT saldo_atual, controla_lote 
    INTO v_saldo_ant, v_controla_lote
    FROM public.produtos
    WHERE id = p_produto_id AND ativo = TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado ou inativo.';
    END IF;

    -- 4. Regras de Lote
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

    -- 5. Atualização de saldo com bypass da proteção para execução legítima de RPC
    PERFORM set_config('app.permitir_alteracao_saldo', 'true', true);

    UPDATE public.produtos
    SET saldo_atual = v_saldo_pos,
        atualizado_em = NOW()
    WHERE id = p_produto_id;

    -- 6. Registro no Ledger Imutável
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


-- 5.2 REGISTRAR SAÍDA DEFINITIVA
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

    -- 2. Validação da Quantidade
    IF p_quantidade <= 0 THEN
        RAISE EXCEPTION 'A quantidade de saída deve ser maior que zero.';
    END IF;

    -- 3. Lock Pessimista no Produto
    SELECT saldo_atual, controla_lote 
    INTO v_saldo_ant, v_controla_lote
    FROM public.produtos
    WHERE id = p_produto_id AND ativo = TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado ou inativo.';
    END IF;

    -- 4. Validação Geral de Saldo Consolidado (Proibido Saldo Negativo)
    IF v_saldo_ant < p_quantidade THEN
        RAISE EXCEPTION 'Saldo insuficiente no produto. Saldo disponível: %, Saída solicitada: %', v_saldo_ant, p_quantidade;
    END IF;

    -- 5. Validação Específica de Lote
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

    -- 6. Atualização de Saldo Consolidado com bypass de segurança para RPC
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


-- 5.3 REGISTRAR CONFERÊNCIA FÍSICA DEFINITIVA
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

    -- 2. Validação da Quantidade Encontrada
    IF p_quantidade_encontrada < 0 THEN
        RAISE EXCEPTION 'A quantidade encontrada na conferência física não pode ser negativa.';
    END IF;

    -- 3. Lock Pessimista no Produto
    SELECT saldo_atual, controla_lote 
    INTO v_saldo_ant, v_controla_lote
    FROM public.produtos
    WHERE id = p_produto_id AND ativo = TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado ou inativo.';
    END IF;

    -- 4. Tratamento por Modalidade de Controle de Lote
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

        -- Registra na tabela dedicada de conferências físicas (snapshot do lote)
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

    -- 5. Se houver divergência, gera registro de ajuste no Ledger Imutável
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

    -- 6. Atualização atômica do saldo do produto com bypass para RPC
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
