# Atalho secreto: 3 cliques no rosto central → /admin

## Por que não está funcionando

Duas causas, confirmadas na leitura do código:

1. **A área clicável está no lugar errado.** Em `src/components/home/HeroVisual.tsx` o botão invisível foi posicionado por estimativa (`left-1/2 top-[32%]`, 10% × 12% da imagem). Essa caixa não coincide com o rosto do personagem do meio da ilustração, então os cliques caem na imagem e nada acontece.

2. **Mesmo navegando, `/admin` não abre.** A rota `/admin` (`src/routes/admin.tsx`) é protegida: sem sessão ela redireciona para `/equipe`; com sessão de visitante (anônima) ela mostra "Acesso negado". Ou seja, para quem não é admin do evento o atalho parece "não dar certo" mesmo quando o clique é registrado.

## O que fazer

1. **Corrigir o hotspot**: medir a posição real do rosto central na ilustração (abrindo a imagem) e reposicionar a área invisível sobre ele, com tamanho um pouco maior para tolerância de clique. Manter a proporção em % para funcionar em qualquer largura.

2. **Tornar o gesto confiável**: contar os 3 cliques dentro de uma janela de ~1s, aceitar toque no mobile e evitar que o clique seja engolido por elementos decorativos acima da imagem (garantir `z-index` do hotspot acima da ilustração).

3. **Levar ao destino certo**: redirecionar para `/equipe` (tela de acesso da equipe/admin) em vez de `/admin` direto — assim quem é admin faz login e chega ao painel, e quem não é vê a tela de acesso normal em vez de "Acesso negado". Se você preferir manter `/admin`, mantenho, mas o comportamento para não-admins continua sendo bloqueio.

4. **Verificar no preview** com Playwright: 3 cliques no ponto → confirmar a mudança de rota.

## Detalhes técnicos

- Arquivo alterado: `src/components/home/HeroVisual.tsx` (apenas frontend).
- Contador de cliques em `useRef` + `setTimeout` de reset; `useNavigate` do TanStack Router.
- Hotspot: `absolute` com `left/top/width/height` em %, `z-10`, sem foco por teclado (`tabIndex={-1}`, `aria-hidden`) para não afetar acessibilidade.
