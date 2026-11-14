-- Usuários FICTÍCIOS de demonstração (senhas documentadas no README).
-- Hashes bcrypt (custo 12). UUIDs fixos para que os dados de demo referenciem o autor.
INSERT INTO auth.profissional (id, tipo_registro, identificacao, nome, email, perfil, senha_hash) VALUES
 ('00000000-0000-4000-8000-0000000000a1','ADMIN','ADMIN-001','Administrador do Sistema','admin@medicalfield.test','ADMIN',
  '$2b$12$ljY12w5/ML7E3kElYjbQIehMU2gAxUJue.4rUBkiDlOavFDgQbnxm'),
 ('00000000-0000-4000-8000-0000000000b1','CRM','CRM-RS-12345','Dra. Helena Duarte','helena@medicalfield.test','PROFISSIONAL',
  '$2b$12$XGCPAlr/wW2U.KM2w5sIDetq7FzLfhBq9GfO3ZdVe2mFUa9ObamX.'),
 ('00000000-0000-4000-8000-0000000000b2','COREN','COREN-RS-67890','Enf. Carlos Mendes','carlos@medicalfield.test','PROFISSIONAL',
  '$2b$12$uefsX39REhfvnQpnU9rwuu5RxunDNVx3V2nOFoolVNed57RU6XKqa'),
 ('00000000-0000-4000-8000-0000000000b3','SOCORRISTA','SOCORRISTA-0042','Marina Lopes (Socorrista)','marina@medicalfield.test','PROFISSIONAL',
  '$2b$12$sizlFZ2.vcyrH5uPDF0cC.xMuY0nw7iP89IcbeXaSZjiSfAmqRdC.')
ON CONFLICT (identificacao) DO NOTHING;
