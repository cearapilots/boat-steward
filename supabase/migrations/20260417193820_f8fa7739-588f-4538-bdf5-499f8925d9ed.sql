-- Permitir SELECT público (anon) nas tabelas de leitura da app.
-- Escritas continuam exigindo authenticated via policy existente "usuarios autenticados podem tudo".

CREATE POLICY "leitura publica historico" ON public.historico FOR SELECT TO anon USING (true);
CREATE POLICY "leitura publica posicoes" ON public.posicoes FOR SELECT TO anon USING (true);
CREATE POLICY "leitura publica ativos" ON public.ativos FOR SELECT TO anon USING (true);
CREATE POLICY "leitura publica lanchas" ON public.lanchas FOR SELECT TO anon USING (true);
CREATE POLICY "leitura publica manutencoes" ON public.manutencoes FOR SELECT TO anon USING (true);