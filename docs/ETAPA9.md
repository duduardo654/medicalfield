# Etapa 9 — Confirmação visual e teste de falha de conexão

## Alteração de interface

Na interface integrada (`http://localhost:3000`), a área **Sincronizar agora** informa o resultado diretamente abaixo do botão:

- **Sincronização concluída**: exibe quantas operações foram enviadas e quantos registros foram recebidos;
- **Sem pendências**: informa que os dados já estão atualizados;
- **Falha/pendências**: informa que não foi possível concluir e que os registros locais foram mantidos para nova tentativa.

Ao clicar no botão, ele é desativado temporariamente para impedir cliques simultâneos. A opção ONLINE continua obrigatória para a sincronização.

## Teste manual de falha e recuperação (Windows)

1. Faça login com a aplicação funcionando e no modo ONLINE.
2. Encerre **somente** a janela do `core-service` (Node.js, normalmente porta 8002). Não encerre o `attendance-client`, porta 3000.
3. Faça um cadastro fictício de pessoa em modo ONLINE. O sistema deverá preservar o registro localmente e mostrar que ele aguarda sincronização. Anote o nome.
4. Clique em **Sincronizar agora**. Deve informar falha ou pendências, sem marcar o registro como sincronizado. Não deve aparecer no painel administrativo central.
5. Reinicie **somente** o `core-service`, usando o mesmo comando do script de inicialização já existente. Não execute uma segunda cópia de todos os serviços sobre portas ocupadas.
6. Clique novamente em **Sincronizar agora**. O aviso deverá confirmar a conclusão; o contador de pendências deve cair a zero.
7. Confira no painel administrativo e no PostgreSQL: a pessoa deve aparecer **uma vez**. Clique novamente em sincronizar para verificar que não duplica.

Durante a falha, não faça logout nem recarregue a página se o login depende da infraestrutura encerrada. A interrupção é simulada no serviço Core, não no seletor ONLINE/OFFLINE.

## Testes automatizados

No diretório raiz do projeto, com as dependências Python já instaladas:

```powershell
python -m unittest discover -s applications/attendance-client -p "test_*.py" -v
```

O teste `test_falha_na_sincronizacao_preserva_pendencia_e_retenta` simula a indisponibilidade do Core e depois sua recuperação, confirmando que nenhuma operação foi marcada como sincronizada antes de uma resposta do servidor.

## Preparação para a VM

- Não foi executada nenhuma conexão SSH nem modificação remota.
- Antes de implantar, conferir o sistema operacional e versões instaladas, disponibilidade do PostgreSQL, acesso às portas e permissões de execução.
- Manter backups do `.env` e dos bancos. Nunca executar `setup.py --reset` em base com dados importantes.
- A documentação legada `docs/IMPLANTACAO.md` ainda contém instruções da versão com duas interfaces e porta 3001. Para a versão integrada, utilizar uma única interface na porta 3000; não subir o portal administrativo antigo como aplicação separada.
- A instalação na VM deve ser preparada somente depois de autorização explícita para operações remotas.
