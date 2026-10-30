# Simulador de Crédito Imobiliário

Simulador de Crédito Imobiliário, Ficha de Análise Financeira, Políticas Comerciais e Importação de Tabelas de Venda (Excel).

**App publicado:** https://calazansvendas-pixel.github.io/FluxoPagamentos/

## Telas

- **Simulador de Crédito** — cálculo inicial de renda, subsídio, FGTS e financiamento por empreendimento.
- **Sinal c/ Banco Direto** — ficha de análise financeira detalhada com parcelamento direto com a construtora.
- **Sinal c/ Morar** — ficha de análise no modelo de parcelamento "Morar" (pró-soluto, pós-obra).
- **Políticas & Empreendimentos** — cadastro e edição das políticas comerciais de cada empreendimento.
- **Importar Tabela (Excel)** — importação de tabelas de unidades/preços a partir de planilhas.

## Stack

React 19 + TypeScript + Vite 6 + Tailwind CSS 4, com persistência local (localStorage) e sincronização opcional com Supabase.

## Rodar localmente

**Pré-requisitos:** Node.js (ou Bun)

```bash
npm install
npm run dev
```

O app abre em `http://localhost:3000`.

Outros comandos úteis:

```bash
npm run build   # build de produção (pasta dist/)
npm run lint    # checagem de tipos (tsc --noEmit)
npm run preview # servir o build de produção localmente
```

## Deploy

O deploy é automático via GitHub Actions (`.github/workflows/deploy.yml`): todo push na branch `main` builda o projeto e publica no GitHub Pages.
