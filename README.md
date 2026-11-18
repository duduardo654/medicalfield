# MedicalField — Prontuário Médico de Emergência

Projeto acadêmico de Arquiteturas de Software (Univates 2026/B). Três APIs independentes em Python, Node.js e Go, com interface integrada e persistência dual PostgreSQL/SQLite. Dados exclusivamente fictícios.

## Acessar a instalação da VM

Iniciar na VM: `sudo systemctl start medicalfield-auth medicalfield-core medicalfield-business medicalfield-admin`.

No Windows:
```powershell
ssh -N -L 3000:127.0.0.1:3000 -L 8001:127.0.0.1:8001 -L 8002:127.0.0.1:8002 -L 8003:127.0.0.1:8003 univates@177.44.248.66
```
Aplicação: http://localhost:3000. Swagger: http://localhost:8001/docs, http://localhost:8002/docs, http://localhost:8003/docs.

Parar na VM: `sudo systemctl stop medicalfield-admin medicalfield-business medicalfield-core medicalfield-auth`.

O modo OFFLINE é simulado pela interface hospedada na VM; a troca de modo não sincroniza. Use o botão Sincronizar agora para enviar pendências e receber dados. Login e cadastro de medicamentos no portal requerem servidor disponível. No Windows, para desenvolvimento independente, utilize `iniciar-tudo.bat` com PostgreSQL local e `.env` próprios.

## Credenciais fictícias de demonstração

| Identificação | Senha | Perfil |
|---|---|---|
| ADMIN-001 | admin123 | Administrador |
| CRM-RS-12345 | medico123 | Profissional médico |
| COREN-RS-67890 | enfer123 | Enfermagem |
| SOCORRISTA-0042 | socor123 | Socorrista |

Não expor essas credenciais em produção. Nunca versionar `.env`, senha SMTP ou JWT_SECRET. Não executar `setup.py --reset` em bancos que devam ser preservados.

## Documentação

- [Arquitetura, bancos, padrões, requisitos e limites](docs/ARQUITETURA.md)
- [APIs e exemplos](docs/API.md)
- [Implantação e operação](docs/IMPLANTACAO.md)
- [Atualização final, segurança e testes](docs/FINALIZACAO.md)
- Roteiro de apresentação: consultar o documento original da disciplina.

## Validação

O aluno confirmou a implantação Ubuntu, JWT, CRUD, sincronização manual, medicamentos, geração de PDF, SMTP e systemd. A atualização final exige instalar Zod 4.6.7 na VM, executar os testes unitários e recompilar Go. Consulte `docs/FINALIZACAO.md`. A documentação anterior das etapas é histórica e pode descrever arquiteturas superadas.
