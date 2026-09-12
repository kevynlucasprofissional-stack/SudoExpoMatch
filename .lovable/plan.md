# Concluir duplas em lote + contar conexões fora do sistema

## 1. Marcar como concluído (29 duplas)

Todas as duplas da sua lista que existem no sistema passam para "concluído", com data/hora do registro e histórico marcado como fechamento em lote da administração:

Marcela e Jalles · Matheus e Diogo · Thomas e Vitória · Thomas e Renato · Matheus e Luciano · Matheus e Fábio · Matheus e Adilson · Matheus e Yuri · Tatiane e João Batista · João Batista e Fábio · João Batista e Daiane · João Batista e Yuri · Jardel e Yuri · Jardel e Fábio · Leyla e Valéria · Raphael e Wallis · Danilo e Vivianne · Danilo e Denise · Ádria e Marcela · Ádria e Deys · Marcela e Naiara · Marcela e Geovane · Wenya e Murillo · Cibele e Bruno Alves · Josenildo e Bruno Alves · Silvino e Geovane · Eduardo Félix e Emmily · Eduardo Félix e Marcela · Eduardo e Rosânia

(A duplicidade "Raphael e Wallis" na lista conta uma vez só.)

## 2. Conexões que aconteceram fora do sistema (10)

Estas duplas envolvem pessoas sem cadastro no evento, então não existem como conexão:

Matheus e Denimarcio · Gabi e Diogo Paiva · Gabi e Paola Regazoni · João Batista e Vivi · Edney Arakaki e Paola Regazoni · Danilo e Paola · Danilo e Vivi (fora do sistema como "Vivi") · Danilo e Thomas · Danilo e Fabiana · Paola e Edemilson · Murilo e Bruno Alves

Para que o painel público mostre o número real de conexões, vou criar um registro de "conexões fora do sistema": uma lista simples com os dois nomes de cada dupla, marcada como concluída, somada ao total de conexões concluídas do painel público. Assim o número exibido passa a refletir todas as conexões que realmente aconteceram.

O painel continuará contando participantes e matches apenas de quem está cadastrado — só o número de conexões concluídas passa a incluir as duplas de fora.

## Detalhes técnicos

1. Migration: nova tabela `public.offline_connections` (`event_id`, `party_a`, `party_b`, `note`, `recorded_by`, timestamps), com GRANTs, RLS habilitada e políticas permitindo leitura/escrita apenas para staff/admin do evento (`has_any_event_role`), além de leitura para `service_role`.
2. Migration: `public.event_stats` passa a somar `offline_connections` do evento em `total_connections` e `completed_connections` (mantendo a assinatura atual, sem alterar o frontend). `event_operational_stats` permanece intacto (métricas operacionais da fila continuam só com conexões reais).
3. `run_sql`: atualização das 29 conexões existentes para `status='concluido'`, `completed_at=now()`, `updated_at=now()`, preenchendo `contact_exchanged_at` quando ainda nulo, com registros correspondentes em `connection_status_history` e `connection_events` (`action='advance'`, nota de fechamento em lote).
4. `run_sql`: inserção das 10 duplas fora do sistema em `offline_connections`, com nota indicando registro manual da administração.
5. Nenhum dado pessoal (WhatsApp, e-mail) é gravado: apenas os primeiros nomes informados por você.
