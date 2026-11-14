-- Medicamentos FICTÍCIOS / ACADÊMICOS. Não utilizar como referência clínica.
INSERT INTO business.medicamento (nome, principio_ativo, apresentacao, via_administracao, dose_max_unitaria, unidade_dose, contraindicacoes, observacao) VALUES
 ('Adrenalina','epinefrina','ampola 1 mg/mL','IM',0.50,'mg','Uso criterioso em cardiopatas','Anafilaxia (demo acadêmica)'),
 ('AAS','ácido acetilsalicílico','comprimido 100 mg','VO',300.00,'mg','Alergia a salicilatos; sangramento ativo','Suspeita de síndrome coronariana'),
 ('Dipirona','dipirona sódica','ampola 500 mg/mL','IV',1000.00,'mg','Alergia a pirazolonas; hipotensão','Analgésico/antitérmico'),
 ('Morfina','sulfato de morfina','ampola 10 mg/mL','IV',10.00,'mg','Depressão respiratória; TCE grave','Dor intensa; monitorar FR'),
 ('Naloxona','cloridrato de naloxona','ampola 0,4 mg/mL','IV',0.40,'mg','Hipersensibilidade','Reversão de opioides'),
 ('Midazolam','midazolam','ampola 5 mg/mL','IM',10.00,'mg','Insuficiência respiratória grave','Crise convulsiva'),
 ('Salbutamol','sulfato de salbutamol','spray 100 mcg/dose','INAL',400.00,'mcg','Hipersensibilidade','Crise asmática'),
 ('Atropina','sulfato de atropina','ampola 0,25 mg/mL','IV',1.00,'mg','Glaucoma de ângulo fechado','Bradicardia sintomática'),
 ('Glicose 50%','glicose hipertônica','ampola 50% 10 mL','IV',25.00,'g','Hiperglicemia','Hipoglicemia confirmada'),
 ('Ondansetrona','ondansetrona','ampola 4 mg/2 mL','IV',8.00,'mg','Síndrome do QT longo','Náusea e vômito'),
 ('Captopril','captopril','comprimido 25 mg','SL',25.00,'mg','Gestação; estenose de artéria renal','Urgência hipertensiva')
ON CONFLICT DO NOTHING;
