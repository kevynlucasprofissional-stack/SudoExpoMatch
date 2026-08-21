# Corrigir o erro ao salvar o perfil

## O que está acontecendo

O envio chega ao servidor, mas o banco rejeita o cadastro com o código `invalid_offer_label` (confirmado nos registros do banco, 4 tentativas seguidas hoje).

Motivo: um dos itens de "o que você oferece" foi salvo com apenas 1 caractere (ex.: "a"). O banco exige rótulos com no mínimo 2 caracteres, mas o formulário aceita 1. Como a tela mostra apenas "Não foi possível salvar o seu perfil. Tente novamente.", o usuário não descobre qual campo está errado.

## Correções

1. **Alinhar a validação do formulário com a regra do banco**
   - Rótulos de ofertas e necessidades passam a exigir de 2 a 80 caracteres (hoje é 1 a 80), com mensagem clara: "Descreva com pelo menos 2 caracteres".
   - Mesma regra para itens vindos das sugestões de IA, para não injetar rótulo curto demais.
   - Assim o erro aparece na própria etapa, antes do envio, e o botão de continuar não deixa avançar com item inválido.

2. **Traduzir os erros do servidor para mensagens úteis**
   - Mapear os códigos devolvidos pelo banco (`invalid_offer_label`, `invalid_need_label`, `duplicate_offer_label`, `duplicate_need_label`, `invalid_offers_count`, `invalid_needs_count`, `missing_fields`, `consent_required`, `invalid_segment`, `field_too_long`) para textos em português que digam exatamente o que revisar.
   - Manter o texto genérico apenas como último recurso.

## Detalhes técnicos

- `src/features/onboarding/schemas.ts`: `wizardOfferSchema.label` e `suggestionItemSchema.label` de `min(1)` para `min(2)` com mensagem própria (o `wizardNeedSchema` herda).
- `src/features/participant/useOwnProfile.ts` (função de mensagem de erro) e/ou o helper usado em `src/routes/participar.tsx`: ampliar o dicionário código → mensagem.
- Sem alterações no banco de dados: a regra do servidor está correta; o formulário é que estava mais permissivo.

## Verificação

- Tentar salvar com um item de 1 caractere: o formulário bloqueia na etapa e mostra o motivo.
- Salvar um cadastro válido de ponta a ponta e confirmar a gravação do perfil.
