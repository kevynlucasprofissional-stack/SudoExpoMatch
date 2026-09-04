-- =====================================================================
-- Exportação de configuração — Matchmaker SudoExpo (ACIRV Connect)
-- Gerado em: 2026-09-04 (UTC)
--
-- Conteúdo: events, segments, taxonomy_items, taxonomy_relations e
-- (opcional) event_staff — apenas papéis.
-- NÃO contém perfis, contatos, telefones, matches, conexões, logs ou chaves.
--
-- Uso: rode este arquivo no banco de destino (as tabelas já devem existir).
-- É reexecutável: registros com o mesmo id são atualizados.
-- =====================================================================

BEGIN;

INSERT INTO public.events (id,name,city,starts_at,ends_at,is_active,created_at,updated_at) VALUES
  ('sudoexpo-2026','SudoExpo 2026','Rio Verde','2026-05-14','2026-05-17','t','2026-07-24 12:21:48.50916+00','2026-07-24 12:21:48.50916+00')
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, city=EXCLUDED.city, starts_at=EXCLUDED.starts_at, ends_at=EXCLUDED.ends_at, is_active=EXCLUDED.is_active, updated_at=EXCLUDED.updated_at;


INSERT INTO public.segments (id,label,emoji,sort_order,profile_selectable,created_at) VALUES
  ('comercio','Comércio','🛍️',1,'f','2026-07-24 12:21:48.50916+00'),
  ('industria','Indústria','🏭',2,'f','2026-07-24 12:21:48.50916+00'),
  ('servicos','Serviços','🛠️',3,'f','2026-07-24 12:21:48.50916+00'),
  ('tecnologia','Tecnologia','💻',4,'t','2026-07-24 12:21:48.50916+00'),
  ('marketing','Marketing e Comunicação','📣',5,'t','2026-07-24 12:21:48.50916+00'),
  ('saude','Saúde','🩺',6,'t','2026-07-24 12:21:48.50916+00'),
  ('educacao','Educação','🎓',7,'t','2026-07-24 12:21:48.50916+00'),
  ('alimentacao','Alimentação','🍽️',8,'t','2026-07-24 12:21:48.50916+00'),
  ('agro','Agronegócio','🌱',9,'t','2026-07-24 12:21:48.50916+00'),
  ('construcao','Construção','🏗️',10,'t','2026-07-24 12:21:48.50916+00'),
  ('financas','Finanças','💳',11,'t','2026-07-24 12:21:48.50916+00'),
  ('logistica','Logística','🚚',12,'t','2026-07-24 12:21:48.50916+00'),
  ('consultoria','Consultoria','🧭',13,'t','2026-07-24 12:21:48.50916+00'),
  ('outros','Outros','🧩',99,'t','2026-08-20 16:03:24.06055+00')
ON CONFLICT (id) DO UPDATE SET label=EXCLUDED.label, emoji=EXCLUDED.emoji, sort_order=EXCLUDED.sort_order, profile_selectable=EXCLUDED.profile_selectable;


INSERT INTO public.taxonomy_items (id,slug,label,kind,segment_id,description,synonyms,active,created_at,updated_at) VALUES
  ('b3ee5697-ca4b-4907-9b73-5cfff615ca60','armazenagem','Armazenagem','both','logistica',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('17ac205a-519d-4aa3-a58f-967b44c73c93','atacado','Atacado','both','comercio',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('7dbb7e16-0484-480a-bbda-31216a4814b9','automacao','Automação','both','tecnologia',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('091cc561-a2f3-477e-a7ca-9c85facfc572','bem-estar-corporativo','Bem-estar corporativo','both','saude',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('d7be3e23-37f6-4278-b57a-3995b4af6902','consultoria-rural','Consultoria rural','both','agro',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('f437007e-6ded-4d54-bd38-9a35dd7b83d6','consultorio','Consultório','both','saude',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('80cbbee9-a630-4094-b938-eb27fb09316c','contabilidade','Contabilidade','both','financas',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('da0f0908-f597-4738-8995-5c6b58078155','credito-empresarial','Crédito empresarial','both','financas',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('9c69617b-0216-4437-8fed-f3c8ee38f115','cursos-livres','Cursos livres','both','educacao',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('765c84dd-41ed-4200-a931-90b84b5e5358','desenvolvimento-de-software','Desenvolvimento de software','both','tecnologia',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('f34881b2-21a1-4274-9b6c-34b9623c6668','design-grafico','Design gráfico','both','marketing',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('906f1793-6b38-41ab-9572-2f2d80987976','e-commerce','E-commerce','both','comercio',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('7b71d1e1-6099-4d84-96bf-cb02778e4591','educacao-tecnica','Educação técnica','both','educacao',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('60150e56-9708-44e0-9ec0-a416e0712f91','embalagens','Embalagens','both','industria',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('006e250f-e224-49c0-a7e7-5f6056674fdf','equipamentos-medicos','Equipamentos médicos','both','saude',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('c6141621-4f1e-4620-96a7-7394f02aea92','fabricacao-sob-demanda','Fabricação sob demanda','both','industria',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('fd23a771-291f-4eec-a2cc-f5f887d0a906','fornecimento-de-refeicoes','Fornecimento de refeições','both','alimentacao',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('605c992c-d0fd-45cf-95b0-f9be7344d430','gestao-de-redes-sociais','Gestão de redes sociais','both','marketing',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('1f67a319-214d-4565-b4cb-a401eca3258b','gestao-empresarial','Gestão empresarial','both','consultoria',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('9fec4fb3-db07-4110-9256-5662edfb11a0','infraestrutura-de-ti','Infraestrutura de TI','both','tecnologia',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('9d6c0c58-b19a-4502-b3b9-b9029b64147a','instalacao','Instalação','both','servicos',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('ae5f879f-f8fe-4263-97a6-0401d466604b','instalacoes-eletricas','Instalações elétricas','both','construcao',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('c437fa29-5de1-4514-932d-4db776eac610','insumos-agricolas','Insumos agrícolas','both','agro',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('acd9e84a-d2d0-4ca8-9761-c54229d48f9c','insumos-alimenticios','Insumos alimentícios','both','alimentacao',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('08e37856-7071-4776-8d92-69156df2c021','juridica','Jurídica','both','consultoria',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('edff2688-bcc4-42e8-873d-bb792bc22c1c','limpeza','Limpeza','both','servicos',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('8bee3c8a-460f-401d-b717-9edc16c6a161','loja-fisica','Loja física','both','comercio',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('226e2485-152c-4151-8255-307537b0f71f','manutencao','Manutenção','both','servicos',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('e5ede952-94ce-424e-82fc-eae0aeb27c68','maquinas-agricolas','Máquinas agrícolas','both','agro',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('0e647435-c8ad-4521-86a2-bbdf686e29f5','materiais-de-construcao','Materiais de construção','both','construcao',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('a8064340-1733-4a22-9dcd-214400b7b9ea','meios-de-pagamento','Meios de pagamento','both','financas',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('b5b1bcc3-258c-4804-b9d4-6ae6ef2ee0c7','metalurgia','Metalurgia','both','industria',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('1f5d4d10-fc86-4ea1-81c8-8f88e590ab44','producao-audiovisual','Produção audiovisual','both','marketing',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('e87b8af2-03a8-4c8e-b653-002fffc81fe4','producao-em-escala','Produção em escala','both','industria',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('6a85787c-3121-4feb-8baa-d0ee63b710bf','projetos-e-obras','Projetos e obras','both','construcao',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('b334aee8-9f82-46cb-9dee-a20607c095ed','restaurante','Restaurante','both','alimentacao',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('9cd51c7c-b88f-450b-abf1-c685964fd69b','revenda-de-produtos','Revenda de produtos','both','comercio',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('b885c998-8d43-4322-962c-5323c536377f','rh-e-pessoas','RH e pessoas','both','consultoria',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('7c842b95-2fa6-434f-ac7e-45f896e6bb3f','suporte-tecnico','Suporte técnico','both','tecnologia',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('9f5e1967-3857-42fc-bf89-a12c0a461d21','terceirizacao','Terceirização','both','servicos',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('c4a45206-8ccd-4abf-95bf-decb23fdc2c1','trafego-pago','Tráfego pago','both','marketing',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('d23a21ab-b024-485f-8fca-3ac2fb9210cf','transporte-de-cargas','Transporte de cargas','both','logistica',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('62b29b0c-131c-4d18-a77d-462e01026808','treinamento-corporativo','Treinamento corporativo','both','educacao',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00'),
  ('3c4f499d-3c55-4288-a184-02f198b9fe93','ultima-milha','Última milha','both','logistica',NULL,'{}'::text[],'t','2026-07-24 13:21:46.606834+00','2026-07-24 13:21:46.606834+00')
ON CONFLICT (id) DO UPDATE SET slug=EXCLUDED.slug, label=EXCLUDED.label, kind=EXCLUDED.kind, segment_id=EXCLUDED.segment_id, description=EXCLUDED.description, synonyms=EXCLUDED.synonyms, active=EXCLUDED.active, updated_at=EXCLUDED.updated_at;


-- ---------------------------------------------------------------------
-- taxonomy_relations — nenhuma relação cadastrada na origem.
-- Modelo para quando existirem:
-- INSERT INTO public.taxonomy_relations
--   (id, from_taxonomy_item_id, to_taxonomy_item_id, relation_type, weight,
--    rationale, active, created_by, created_at, updated_at)
-- VALUES (...)
-- ON CONFLICT (id) DO UPDATE SET
--   relation_type = EXCLUDED.relation_type,
--   weight        = EXCLUDED.weight,
--   rationale     = EXCLUDED.rationale,
--   active        = EXCLUDED.active,
--   updated_at    = EXCLUDED.updated_at;
-- ---------------------------------------------------------------------

COMMIT;

-- =====================================================================
-- BLOCO OPCIONAL — equipe (somente papel, sem dados pessoais)
--
-- ATENÇÃO: event_staff.user_id referencia auth.users. Este bloco só
-- funciona se a MESMA conta existir no ambiente de destino com o mesmo
-- identificador. Caso contrário, cadastre o administrador pelo próprio
-- app (Admin > Equipe) e ignore este bloco.
-- Descomente para aplicar:
-- =====================================================================

-- INSERT INTO public.event_staff (id, event_id, user_id, role, created_at) VALUES
--   ('6535b2f6-27ba-45bc-a047-0717df51a939','sudoexpo-2026','90938fc4-1f10-4c4e-a279-0ab55ad701bd','admin','2026-08-03T12:57:41.521149+00:00')
-- ON CONFLICT DO NOTHING;
