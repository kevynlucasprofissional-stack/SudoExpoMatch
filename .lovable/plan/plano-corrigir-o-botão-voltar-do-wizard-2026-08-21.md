# Plano: corrigir o botão Voltar do wizard

## Objetivo
Deixar o botão de voltar perfeitamente quadrado e com a mesma altura visual do bloco formado pelo contador de etapas e pela barra de progresso, em todas as etapas e larguras de tela.

## Diagnóstico confirmado
- No navegador, o bloco do contador com a barra mede **32 px de altura**.
- O botão também está sendo esticado para **32 px de altura**, mas sua largura permanece fixa em **28 px** por causa de `w-7`.
- Essa combinação (`h-auto`, `self-stretch` e largura fixa menor) produz um botão de **28 × 32 px**, portanto ele não é quadrado e visualmente parece desalinhado.
- A altura atual depende do esticamento automático do flex, em vez de uma dimensão comum e previsível para os dois lados.

## Alteração proposta
1. Definir uma altura estrutural comum de **32 px** para a linha superior do wizard.
2. Tornar o botão explicitamente **32 × 32 px**, removendo `w-7`, `h-auto` e `self-stretch`.
3. Organizar o contador e a barra dentro da mesma altura fixa, mantendo o espaço atual entre eles e o início da barra alinhado ao início da palavra “Etapa”.
4. Preservar o comportamento atual: a seta aparece apenas depois da primeira etapa e continua voltando uma etapa por clique.

## Validação
- Medir no navegador os retângulos do botão e do bloco à direita e confirmar **32 × 32 px** para o botão e **32 px** de altura para o conjunto contador/progresso.
- Conferir visualmente desktop e mobile para garantir formato quadrado, alinhamento vertical e ausência de deslocamento da barra.
- Validar que o clique continua retornando à etapa anterior e que não houve regressão no restante do formulário.

## Arquivo afetado
- `src/routes/participar.tsx`