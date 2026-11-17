-- Preenche o nome/identificação do profissional nos atendimentos de demonstração.
UPDATE core.atendimento a
   SET profissional_nome = p.nome, profissional_identificacao = p.identificacao
  FROM auth.profissional p
 WHERE p.id = a.profissional_id AND a.profissional_nome IS NULL;
