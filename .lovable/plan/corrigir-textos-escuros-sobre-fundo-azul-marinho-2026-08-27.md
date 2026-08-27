# Corrigir textos escuros sobre fundo azul-marinho

Objetivo: nenhum texto escuro/preto sobre o fundo marinho (#0b1252 / #02072A). Onde o fundo é escuro, o texto passa a ser branco (ou a cor clara da marca).

## O que a varredura já mostrou

1. **Causa principal (afeta várias telas):** no tema marinho (`.brand-navy` em `src/styles.css`) quase todos os tokens de texto foram redefinidos para branco, **exceto** `--success-foreground` e `--warning-foreground`, que continuam com os valores claros do tema branco (texto quase preto). Toda badge/aviso que usa fundo translúcido + esse texto fica ilegível:
   - `src/features/participant/presentation.ts` (`bg-warning/15 text-warning-foreground`, `bg-success/15 text-success-foreground`)
   - `src/features/connections/domain.ts` (mesmos pares)
   - `src/features/participant/components/MatchesList.tsx:110` (aviso amarelo)
   - `src/features/participant/components/MatchCard.tsx` (chips de status)
   - qualquer outro ponto que use esses tokens sobre superfície translúcida

2. **Casos legítimos que NÃO devem mudar:** texto escuro sobre fundo *claro* continua correto — números amarelos da home (`bg-[#eaff00] text-[#0b1252]`), botões verde-lima (`bg-success text-[#0b1252]`), cartões brancos (`bg-white/95 text-[#0b1252]`) em `ProcessPanel.tsx`, `Hero.tsx`, `FinalCta.tsx`. Trocar esses para branco quebraria a leitura.

## Plano

1. **Corrigir os tokens no tema marinho** (`src/styles.css`, bloco `.brand-navy`): definir `--success-foreground` e `--warning-foreground` como branco, e conferir todos os demais `*-foreground` do bloco para garantir que nenhum herde valor escuro do tema claro.
2. **Ajustar os badges/avisos** que dependem do fundo translúcido para usarem a cor da própria marca em versão clara (ex.: texto `text-warning` / `text-success` sobre `bg-warning/15`), garantindo contraste real e não só "branco no branco".
3. **Varredura automatizada de contraste (Playwright):** percorrer as telas reais — `/`, `/participar` (todas as etapas do wizard, incluindo diálogos), `/participante`, `/publico`, `/equipe`, `/admin`, `/admin/matches`, `/admin/participantes`, `/admin/taxonomia` — medir cor computada do texto × cor de fundo efetiva de cada elemento visível e listar tudo abaixo do limite de contraste (WCAG AA 4.5:1). Isso captura também casos que o grep não vê (componentes shadcn, popovers, selects, tooltips, toasts).
4. **Corrigir cada ocorrência encontrada** pela varredura, sempre preferindo token semântico em vez de cor fixa, e mantendo intocados os casos de texto escuro sobre fundo claro.
5. **Revalidar** rodando a mesma varredura até a lista ficar vazia, e confirmar visualmente com capturas das telas principais.

## Detalhes técnicos

- Mudança de tema concentrada em `src/styles.css` (bloco `.brand-navy`), o que corrige de uma vez todas as telas envolvidas pelo `PageShell`.
- Correções pontuais em componentes só onde o token não resolve.
- Script de auditoria fica em `/tmp/browser/`, fora do projeto.
- Sem alteração de lógica de negócio, banco ou rotas — apenas apresentação.
