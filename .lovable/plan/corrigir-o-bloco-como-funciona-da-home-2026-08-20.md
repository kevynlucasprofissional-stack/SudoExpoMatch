# Corrigir o bloco "Como funciona" da home

O painel atual descreve um passo que o produto não faz ("Avalie suas conexões") e omite o elo central do fluxo: o interesse precisa ser mútuo para a ACIRV entrar em cena.

## Novos 4 passos

1. **Crie seu perfil** — o que você oferece e o que procura
2. **Receba matches automáticos** — cruzamento feito na hora, com o motivo
3. **Marque interesse mútuo** — os dois lados precisam confirmar
4. **A ACIRV apresenta vocês** — encontro presencial na feira

## Detalhes técnicos

- Arquivo único: `src/components/home/ProcessPanel.tsx`, constante `STEPS`.
- Manter os 4 itens (layouts mobile vertical e desktop horizontal já suportam 4).
- Ícones ajustados: `UserPlus`, `Sparkles` (matches automáticos), `Heart` ou `Star` (interesse mútuo), `Handshake`.
- Nenhuma mudança de lógica de negócio, rota ou banco.
