# Formulário simplificado de medicamentos

Atualização incremental sobre medicalfield-ajuste-medicamentos.zip. Apenas a interface foi alterada. Nome e princípio ativo obrigatórios; apresentação, via de administração (lista suspensa), contraindicações e observações opcionais. Dose máxima e unidade não aparecem no formulário; continuam no banco e na API, sem alteração dos dados existentes. Novos registros pela interface deixam esses campos nulos. A dose do atendimento continua disponível. Nenhuma mudança de sincronização ou de permissões.

## Instalação na VM
Transferir o ZIP para o diretório pessoal e, no Linux, executar `cd ~ && unzip -o medicalfield-medicamentos-simplificado.zip`. Reiniciar `sudo systemctl restart medicalfield-admin` e atualizar o navegador com Ctrl+Shift+R. Não é necessário recompilar Go, executar migrations ou modificar .env.

## Validação
Cadastrar um medicamento fictício em ONLINE com nome e princípio ativo diferentes dos existentes e escolher uma via. Conferir mensagem de sucesso, lista de medicamentos e seleção no atendimento. Confirmar no PostgreSQL: `SELECT nome, principio_ativo, via_administracao, dose_max_unitaria, unidade_dose FROM business.medicamento ORDER BY created_at DESC LIMIT 5;`. A via deverá estar conforme a seleção; os dois campos removidos deverão ser nulos para o novo registro. Registros anteriores não são modificados. Em OFFLINE, cadastro continua bloqueado e consulta continua disponível.

Dados exclusivamente acadêmicos; não utilizar como orientação clínica.
