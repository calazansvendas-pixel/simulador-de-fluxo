# Simulador de Fluxo (Morar) — regras do projeto

## Fluxo obrigatório de 3 camadas

| Camada | Onde | Branch |
|---|---|---|
| 1. Desenvolvimento local | `http://127.0.0.1:3000/` (`npm run dev`) | `feat/...` ou `fix/...` (temporárias) |
| 2. Teste / Homologação | Link de Preview da Vercel da branch `homologacao` | `homologacao` (permanente) |
| 3. Produção oficial | Vercel (deploy automático da `main`) | `main` |

### Camada 1 — Desenvolvimento local
- Sempre criar uma branch temporária a partir da `main` atualizada:
  `git checkout main && git pull origin main && git checkout -b feat/<nome>` (ou `fix/<nome>`).
- Testar em `http://127.0.0.1:3000/`.
- Antes de qualquer commit: `npx tsc --noEmit` e `npm run build` sem erros.

### Camada 2 — Teste / Homologação
- Concluído localmente (e com autorização para commitar), fazer merge da branch temporária na `homologacao`:
  `git checkout homologacao && git pull origin homologacao && git merge feat/<nome> && git push origin homologacao`.
- Testes exaustivos no link de Preview da Vercel da `homologacao`.

### Camada 3 — Produção (`main`)
- **NUNCA** fazer merge na `main` (nem push para `origin/main`) sem autorização explícita do Rafael,
  dada **depois** da validação completa na camada `homologacao`.
- Com a autorização: `git checkout main && git pull origin main && git merge homologacao && git push origin main`
  e informar o hash publicado.

## Regras gerais
- Commit, merge e push só quando o Rafael pedir, com a mensagem exata que ele der.
- Não alterar a normalização/regex de tipologias (não remover a letra "s" nem o asterisco "*").
