-- Roteiro de testes, item 9: "Portal: Inserir novos medicamentos via Banco de Dados".
-- Execute no pgAdmin/DBeaver (conectado ao banco medicalfield) ou com psql. Dados FICTÍCIOS.
-- Não precisa reiniciar nada: o trigger atualiza updated_at e o cliente recebe no próximo "Sincronizar".
INSERT INTO business.medicamento
  (nome, principio_ativo, apresentacao, via_administracao, dose_max_unitaria, unidade_dose, contraindicacoes, observacao)
VALUES
  ('Ibuprofeno', 'ibuprofeno', 'comprimido 600 mg', 'VO', 600.00, 'mg', 'Úlcera gástrica; gestação (3º trimestre)', 'Analgésico/anti-inflamatório (demo acadêmica)');

-- Para conferir:
-- SELECT nome, apresentacao, updated_at FROM business.medicamento ORDER BY updated_at DESC LIMIT 5;
-- Para desativar um medicamento (o cliente também recebe a mudança):
-- UPDATE business.medicamento SET ativo = false WHERE nome = 'Ibuprofeno';
