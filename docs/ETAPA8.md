# Etapa 8 — Correção do carregamento de medicamentos

## Causa identificada

O cliente FastAPI declarava `GET /api/{entity}` antes de `GET /api/medicamento`. A rota genérica capturava `GET /api/medicamento`, rejeitava a entidade e devolvia HTTP 404 com `Entidade inválida`, mesmo que o medicamento estivesse cadastrado corretamente no PostgreSQL.

## Correção

Em `applications/attendance-client/server.py`, `GET /api/medicamento` e `POST /api/medicamento/cache` agora são declaradas antes de `GET /api/{entity}`. Não houve alteração nos esquemas PostgreSQL, no conteúdo do banco local ou nos três microsserviços.

## Atualizar no Windows

1. Feche as janelas do `iniciar-tudo.bat` anterior.
2. Faça backup do `.env` e de `applications/attendance-client/data/medicalfield.sqlite3` da instalação atual.
3. Extraia esta versão e recoloque os dois arquivos em seus locais originais.
4. Execute `iniciar-tudo.bat`, abra `http://localhost:3000` e faça login.
5. Selecione ONLINE e clique em **Sincronizar agora**. O campo **Medicamento administrado** deve mostrar os medicamentos ativos do banco central.
6. Selecione OFFLINE e verifique se a lista permanece disponível.

Não é necessário executar migrations novamente nem inserir o medicamento uma segunda vez.

## Teste de regressão

Na raiz do projeto, com as dependências Python instaladas:

```powershell
services\auth-service\.venv\Scripts\python.exe -m unittest discover -s applications/attendance-client -p "test_*.py" -v
```

O teste `test_medicamentos_cache_e_consulta_online_offline` confirma que a rota remota funciona, que o cache aceita o retorno do serviço e que a listagem funciona mesmo em OFFLINE. Os demais testes validam login, permissões e sincronização simulada.

## Validação adicional se a lista permanecer vazia

- Confirme no pgAdmin: `SELECT id, nome, ativo FROM business.medicamento ORDER BY nome;`
- Teste `GET /medicamento` autenticado em `http://localhost:8003/docs`. Deve retornar uma lista JSON, incluindo o registro desejado.
- Atualize a página com Ctrl+F5 para evitar JavaScript antigo em cache.
- Confirme que está executando o novo pacote, não uma janela/instância da etapa 7.

O teste automatizado não usa o seu PostgreSQL nem o SMTP real; a verificação ponta a ponta ainda deve ser executada no seu computador.
