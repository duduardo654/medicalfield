# Etapa 7 — Origem real, confirmação do cadastro e seleção de medicamentos

## Correções

- Cadastros feitos no modo **ONLINE** recebem `origem = 'ONLINE'` no PostgreSQL quando confirmados pelo Core.
- Cadastros feitos no modo **OFFLINE**, enviados depois, recebem `origem = 'OFFLINE'`.
- A `Outbox` continua sendo utilizada em ambos os modos para proteção contra falhas e idempotência. O fato de um registro passar pela sincronização **não** significa que foi criado offline.
- Confirmação do cadastro é exibida **junto ao formulário**. Se a central não confirmar, a mensagem indica que está aguardando sincronização; o dado não é perdido.
- O medicamento é selecionado em uma lista de registros existentes, recebidos do serviço de Negócio quando ONLINE e mantidos no cache local para uso OFFLINE. A dose continua sendo informada pelo profissional. É um projeto acadêmico com medicamentos fictícios, sem recomendação clínica.

> **Importante:** Registros online de etapas anteriores que já estão com origem `OFFLINE` permanecem assim. Não é seguro alterar o histórico automaticamente, pois não é possível distinguir com certeza a origem real dos registros antigos. Crie novos registros para validar a correção.

## Instalação Windows

1. Feche as janelas de execução anteriores.
2. Faça backup do `.env` e, se desejar manter os registros do cliente, de `applications/attendance-client/data/medicalfield.sqlite3`.
3. Extraia a nova versão do projeto e mantenha os arquivos `.env` e `.sqlite3` nos mesmos locais (não os envie a terceiros).
4. Execute `iniciar-tudo.bat` e abra **http://localhost:3000**.
5. Faça um cadastro ONLINE e verifique o status/coluna `origem`; depois repita OFFLINE e sincronize.

## Auditoria: como consultar

No **pgAdmin** conectado ao PostgreSQL central:

```sql
SELECT ocorrido_em, servico, profissional_id, ip_cliente,
       metodo, rota, status_code, tempo_ms, origem, detalhe
FROM audit.access_log
ORDER BY ocorrido_em DESC
LIMIT 50;
```

Para ver os serviços que geraram logs:

```sql
SELECT servico, origem, COUNT(*) AS quantidade
FROM audit.access_log
GROUP BY servico, origem
ORDER BY servico, origem;
```

Para ver especificamente o que foi registrado pelo cliente enquanto estava offline e depois enviado:

```sql
SELECT ocorrido_em, servico, metodo, rota, origem, detalhe
FROM audit.access_log
WHERE origem = 'OFFLINE'
ORDER BY ocorrido_em DESC
LIMIT 30;
```

Os logs HTTP também aparecem no terminal dos serviços e nos arquivos:

- `logs/auth-service.log`
- `logs/core-service.log`
- `logs/business-service.log`

O endpoint `GET /log` do Core também consulta os logs, mas exige usuário **ADMIN** autenticado.

## O que é receber dados (PULL)

A sincronização tem dois sentidos:

1. **PUSH:** envia operações que o cliente criou para o PostgreSQL oficial.
2. **PULL:** baixa do PostgreSQL para a cópia local registros de pessoas, prontuários e atendimentos; o cliente também busca a lista de medicamentos pelo serviço de Negócio e a mantém disponível no modo OFFLINE.

Para demonstrar: usando um perfil ADMIN, cadastre/altere um medicamento fictício via pgAdmin; volte à interface, clique **Sincronizar agora**, confira a lista de medicamentos do formulário e depois selecione OFFLINE: o medicamento continua disponível.

## Testar endpoints sem expor tokens

Com os serviços iniciados no Windows, abra a documentação interativa:

- Autenticação: `http://localhost:8001/docs`
- Core: `http://localhost:8002/docs`
- Negócio: `http://localhost:8003/docs`

Primeiro faça `POST /auth/login` com as **credenciais fictícias de demonstração** documentadas no README; copie apenas o `access_token` para o botão **Authorize** do Swagger, se necessário, e use `GET /pessoa` ou `GET /medicamento` para obter 200. Execute a mesma chamada sem token para verificar a rejeição 401. No Core use `GET /log` com um usuário ADMIN. Não publique seus tokens ou o `.env`.

## Consultar origem online/offline

```sql
SELECT id, nome, origem, created_at
FROM core.pessoa
ORDER BY created_at DESC
LIMIT 20;
```

## Limites da validação no ambiente de desenvolvimento

Testes automáticos do cliente usam uma API Core simulada. A alteração do Core foi verificada estaticamente, mas o teste ponta a ponta com PostgreSQL e APIs reais deve ser feito no seu Windows. Não houve acesso à VM Linux.
