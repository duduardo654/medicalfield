-- Dados de demonstração (pessoas FICTÍCIAS) para o item 2-4 do roteiro:
-- o Portal já deve listar cadastros, prontuários e atendimentos antes de qualquer sync.
INSERT INTO core.pessoa (id, nome, cpf, data_nascimento, sexo, telefone, email, contato_emergencia, criado_por) VALUES
 ('11111111-1111-4111-8111-111111111111','João da Silva','900.000.000-01','1980-03-15','M','(51) 99999-0001','joao.silva@exemplo.test','Maria da Silva - (51) 99999-1001','00000000-0000-4000-8000-0000000000b1'),
 ('22222222-2222-4222-8222-222222222222','Ana Pereira','900.000.000-02','1992-11-02','F','(51) 99999-0002','ana.pereira@exemplo.test','Pedro Pereira - (51) 99999-1002','00000000-0000-4000-8000-0000000000b2'),
 ('33333333-3333-4333-8333-333333333333','Carlos Oliveira','900.000.000-03','1965-07-28','M','(51) 99999-0003',NULL,'Luiza Oliveira - (51) 99999-1003','00000000-0000-4000-8000-0000000000b3')
ON CONFLICT (id) DO NOTHING;

INSERT INTO core.prontuario (id, pessoa_id, tipo_sanguineo, alergias, condicoes_cronicas, medicamentos_uso_continuo, observacoes, criado_por) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','11111111-1111-4111-8111-111111111111','O+','Dipirona','Hipertensão','Losartana 50 mg','Paciente colaborativo','00000000-0000-4000-8000-0000000000b1'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','22222222-2222-4222-8222-222222222222','A-','Nenhuma conhecida','Asma','Salbutamol de resgate',NULL,'00000000-0000-4000-8000-0000000000b2')
ON CONFLICT (id) DO NOTHING;

INSERT INTO core.atendimento (id, prontuario_id, pessoa_id, profissional_id, data_hora, local_ocorrencia, queixa_principal, descricao,
  pa_sistolica, pa_diastolica, freq_cardiaca, freq_respiratoria, spo2, temperatura, glicemia,
  glasgow_ocular, glasgow_verbal, glasgow_motor, triagem_manchester, triagem_start, conduta, encaminhamento) VALUES
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-0000000000b1',
  now() - interval '2 days','BR-116 km 310','Dor torácica','Dor precordial há 30 min, sudorese.',
  150,95,102,20,96,36.6,110, 4,5,6,'LARANJA','AMARELO','AAS 300 mg VO; monitorização; O2 se SpO2 < 94%.','Hospital de Pronto Socorro'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','22222222-2222-4222-8222-222222222222','00000000-0000-4000-8000-0000000000b2',
  now() - interval '1 day','Praça Central','Dispneia','Crise asmática leve após exposição a poeira.',
  120,80,98,26,92,36.4,95, 4,5,6,'AMARELO','VERDE','Salbutamol inalatório 400 mcg.','Alta no local com orientação')
ON CONFLICT (id) DO NOTHING;

INSERT INTO core.atendimento_medicamento (id, atendimento_id, medicamento_id, nome, dose, via, horario)
SELECT 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', m.id, 'AAS','300 mg','VO', now() - interval '2 days'
FROM business.medicamento m WHERE m.nome='AAS' LIMIT 1
ON CONFLICT (id) DO NOTHING;
INSERT INTO core.atendimento_medicamento (id, atendimento_id, medicamento_id, nome, dose, via, horario)
SELECT 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', m.id, 'Salbutamol','400 mcg','INAL', now() - interval '1 day'
FROM business.medicamento m WHERE m.nome='Salbutamol' LIMIT 1
ON CONFLICT (id) DO NOTHING;
