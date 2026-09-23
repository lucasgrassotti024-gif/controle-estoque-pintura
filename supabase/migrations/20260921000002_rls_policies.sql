-- ==============================================================================
-- SISTEMA DE CONTROLE DE ESTOQUE - POLÍTICAS DE SEGURANÇA (RLS)
-- ==============================================================================

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conferencias_fisicas ENABLE ROW LEVEL SECURITY;

-- 1. Políticas de Usuários
CREATE POLICY "Usuários autenticados podem ver perfis"
ON public.usuarios FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Apenas ADMIN pode alterar usuários"
ON public.usuarios FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.usuarios
        WHERE id = auth.uid() AND papel = 'ADMIN'
    )
);

-- 2. Políticas de Produtos
CREATE POLICY "Todos autenticados podem consultar produtos"
ON public.produtos FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Gestores e Admins podem criar e alterar produtos"
ON public.produtos FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.usuarios
        WHERE id = auth.uid() AND papel IN ('ADMIN', 'GESTOR')
    )
);

CREATE POLICY "Gestores e Admins podem atualizar dados de produtos"
ON public.produtos FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.usuarios
        WHERE id = auth.uid() AND papel IN ('ADMIN', 'GESTOR')
    )
);

-- Nota: Movimentações diretas de saldo_atual via UPDATE de clientes são restringidas;
-- As alterações de saldo ocorrem exclusivamente pelas funções RPC (SECURITY DEFINER).

-- 3. Políticas de Lotes
CREATE POLICY "Todos autenticados podem consultar lotes"
ON public.lotes FOR SELECT
TO authenticated
USING (true);

-- 4. Políticas de Movimentações (Histórico Imutável)
CREATE POLICY "Todos autenticados podem visualizar histórico de movimentações"
ON public.movimentacoes FOR SELECT
TO authenticated
USING (true);

-- Proibição total de DELETE ou UPDATE em movimentações pelo frontend
-- O histórico é estritamente de append-only.

-- 5. Políticas de Conferências Físicas
CREATE POLICY "Todos autenticados podem consultar conferências físicas"
ON public.conferencias_fisicas FOR SELECT
TO authenticated
USING (true);
