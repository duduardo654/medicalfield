# Atualização final — segurança e documentação

Esta atualização substitui apenas código, testes e documentação. Não altera `.env`, bancos, migrations, interface ou comportamento da sincronização. Não reinstala systemd. O Zod 3 está afetado pelo advisory GHSA-mrhx-c7xc-m3w5 (corrigido a partir da 4.6.6). A migração usa `z.guid()` para preservar UUIDs legados e `z.record(z.string(), z.any())` para manter o envelope da outbox. A versão 4.6.7 deve ser instalada na VM e gravada no package.json/package-lock.json. As três APIs passam a escutar em 127.0.0.1; a GUI já estava restrita. O túnel SSH continua funcionando.

## Antes de aplicar

Na VM, confirme que o ZIP foi transferido e faça backup dos arquivos que podem ser alterados:

```bash
cd ~/medicalfield
mkdir -p backups
 tar -czf backups/antes-finalizacao-$(date +%Y%m%d-%H%M%S).tar.gz README.md docs services/core-service/package.json services/core-service/package-lock.json services/core-service/src services/core-service/test services/auth-service/run.py services/business-service/main.go services/business-service/bin/business-service-linux-amd64
sudo systemctl stop medicalfield-admin medicalfield-business medicalfield-core medicalfield-auth
cd ~
unzip -o medicalfield-finalizacao.zip
```

## Atualizar e verificar a dependência

```bash
cd ~/medicalfield/services/core-service
npm install --save-exact zod@4.6.7
npm ls zod
npm audit
node --test test/validation-v4.test.js test/errors.test.js
```
Não utilize `npm audit fix --force`. Se a instalação ou testes falharem, não inicie o Core com a atualização parcial; preserve a saída e restaure a versão anterior se necessário. A execução desses testes requer a instalação real do Zod 4.6.7 na VM; neste ambiente não há acesso ao registry npm.

## Recompilar Go e iniciar

```bash
cd ~/medicalfield/services/business-service
go test ./...
go build -o bin/business-service-linux-amd64 .
cd ~/medicalfield
sudo systemctl start medicalfield-auth medicalfield-core medicalfield-business medicalfield-admin
systemctl is-active medicalfield-auth medicalfield-core medicalfield-business medicalfield-admin
sudo ss -ltnp | grep -E ':(3000|8001|8002|8003)\b'
```
Se houver erro, não exponha portas como solução; verifique journalctl. Esperado: quatro `active`, quatro endereços loopback `127.0.0.1:porta`.

## Confirmação pós-atualização

Repetir login, cadastro ONLINE, OFFLINE seguido de sincronização manual, medicamento e envio da ficha. Testar Swagger com e sem JWT. `npm audit` deve deixar de acusar o advisory Zod; outros avisos devem ser avaliados separadamente. O teste de integração `npm test` também existe, mas cadastra dados fictícios e pressupõe seeds (não é necessário repetir em banco de apresentação se a validação manual for feita).

## Reversão em caso de erro

Pare os serviços, escolha o arquivo `backups/antes-finalizacao-*.tar.gz` recém-criado e extraia **a partir de ~/medicalfield** com `tar -xzf backups/NOME_DO_BACKUP.tar.gz`. Reinstale o lock anterior com `cd services/core-service && npm ci`, remova `test/validation-v4.test.js` se não existia antes e reinicie as unidades. Isso volta à versão anterior, inclusive a vulnerabilidade e bindings anteriores; mantenha o uso restrito e não exponha APIs até corrigir. Não remove nem recria bancos.

## Fontes

- GitHub Advisory: https://github.com/advisories/GHSA-mrhx-c7xc-m3w5
- Guia de migração Zod: https://zod.dev/v4/changelog
- Documento original da disciplina: Trabalho Final MedicalField, Arquiteturas de Software, Univates 2026/B.
