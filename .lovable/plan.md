# Registro em lote de "troca de contato"

Você listou 37 duplas. Conferi cada uma no banco (evento SudoExpo 2026).

## 1. Duplas que serão registradas agora (25)

Todas estão hoje em "apresentados" e serão movidas para "contato trocado", com data/hora do registro e histórico marcado como registro em lote feito pela administração:

- Marcela e Jalles Dener
- Matheus Carvalho e Diogo Paiva
- Thomas e Vitória
- Thomas e Renato
- Matheus Carvalho e Luciano
- Matheus Carvalho e Fábio Velozo
- Matheus Carvalho e Adilson
- Matheus Carvalho e Yuri
- João Batista e Tatiane
- João Batista e Fábio Velozo
- João Batista e Daiane
- João Batista e Yuri
- Jardel e Yuri
- Jardel e Fábio Velozo
- Leyla e Valéria
- Raphael e Wallis
- Danilo Monteiro e Vivianne
- Danilo Monteiro e Denise
- Ádria Rocha e Marcela
- Marcela e Naiara
- Marcela e Geovane
- Wenya e Murillo Garcia
- Cibele e Bruno Alves
- Eduardo Félix e Emmily Novaes
- Eduardo Félix e Marcela
- Eduardo Félix e Rosânia

## 2. Duplas já registradas antes (nenhuma ação)

- Ádria Rocha e Deys
- Josenildo e Bruno Alves
- Silvino e Geovane

## 3. Duplas que não consigo registrar

Nestes casos não existe a dupla no sistema — em geral porque um dos nomes não tem cadastro no evento (Gabi, Paola Regazoni, Edney Arakaki, Fabiana, Edemilson) ou porque a dupla nunca foi criada como conexão:

- Matheus e Denimarcio
- Gabi e Diogo Paiva
- Gabi e Paola Regazoni
- João Batista e Vivi
- Edney Arakaki e Paola Regazoni
- Danilo e Paola
- Danilo e Thomas
- Danilo e Fabiana
- Paola e Edemilson
- Murilo e Bruno Alves

Se algum desses nomes for na verdade outra pessoa da lista (apelido diferente), me diga o nome completo e eu registro junto.

## Detalhes técnicos

- Atualização direta em `public.connections` para os 25 IDs confirmados: `status = 'contato_trocado'`, `contact_exchanged_at = now()`, `updated_at = now()`.
- Inserções correspondentes em `connection_status_history` e `connection_events` (`action = 'advance'`, `previous_status = 'apresentados'`, `new_status = 'contato_trocado'`, nota identificando o registro em lote administrativo), replicando os efeitos de `staff_advance_connection`.
- Nenhum contato pessoal é exposto, nenhum match ou decisão de participante é alterado, e nada é feito nos casos das seções 2 e 3.
