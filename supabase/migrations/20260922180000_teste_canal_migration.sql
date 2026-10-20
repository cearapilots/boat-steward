-- Teste do canal de migration pelo CLI, 22/09/2026. Nao altera estrutura.
-- Se esta linha esta no banco, eu consigo aplicar SQL sem passar pelo editor.
INSERT INTO public.configuracoes (chave, valor, descricao)
VALUES ('canal_migration_cli', 'ok',
        'Confirma que migrations podem ser aplicadas pelo CLI. Registrado em 22/09/2026.')
ON CONFLICT (chave) DO UPDATE SET valor = 'ok', updated_at = now();
