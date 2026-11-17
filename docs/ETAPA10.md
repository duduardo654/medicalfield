# Etapa 10 — Sincronização somente por comando do usuário

## Fluxo atualizado

- **Entrar na tela/login:** consulta apenas dados já persistidos localmente; não envia pendências nem recebe registros remotos e não apresenta confirmação de sincronização.
- **OFFLINE → ONLINE:** altera somente o estado de conectividade simulada e habilita o botão. Não sincroniza.
- **Cadastrar ONLINE:** salva localmente e envia **somente o novo registro** para confirmação imediata no servidor central. Se falhar, fica pendente; isso não executa a fila nem realiza o recebimento de dados.
- **Cadastrar OFFLINE:** salva localmente e entra na fila pendente; não acessa a rede.
- **Sincronizar agora:** única ação da interface que executa o envio da fila pendente, o recebimento de pessoas/prontuários/atendimentos, os logs offline e a atualização do cache de medicamentos. A mensagem de confirmação ou falha é apresentada somente após clicar.
- **Trocar de modo, login e logout:** limpam qualquer confirmação de sincronização anterior.

## Teste de validação

1. Abra o sistema. Nenhuma mensagem de sincronização concluída deve aparecer.
2. Entre em OFFLINE, crie pessoa, prontuário e atendimento e confira o número de pendências.
3. Volte a ONLINE. O contador permanece; o PostgreSQL ainda não deve conter os registros offline.
4. Clique em **Sincronizar agora**. Aguarde a mensagem de confirmação. Os registros devem chegar ao PostgreSQL.
5. Clique novamente para receber a mensagem de que não havia pendências.
6. Mude de ONLINE para OFFLINE e de volta para ONLINE: não deve aparecer confirmação de sincronização.

**Nota acadêmica:** o requisito de Observer estava originalmente ligado ao disparo automático de sincronização após o retorno da conectividade. Por solicitação do usuário, o Observer pode continuar informando o estado e habilitando o botão, mas o envio é intencionalmente manual. Descrever essa decisão na apresentação, pois o documento original propõe o disparo automático.

## Testes automatizados

```powershell
python -m unittest discover -s applications/attendance-client -p 'test_*.py' -v
```
