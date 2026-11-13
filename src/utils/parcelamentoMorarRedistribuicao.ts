// Redistribuição do fluxo do "Parcelamento Morar" — função PURA (sem React, sem estado oculto).
//
// Regras:
// - Quem participa da redistribuição é decidido SÓ pelo cadeado (`travado`). Cadeado aberto = pode ceder/receber.
// - Pisos: Ato >= sinal mínimo da política; demais parcelas >= 0.
// - Tetos: % da Política sobre a base LÍQUIDA (imóvel − Desconto do Ato Premiado), a mesma do gráfico de
//   Percentuais de Comprometimento. Como o desconto depende do Ato, os tetos são recalculados com o Ato final.
// - Identidade do fluxo: Ato + Σ demais = totalPara(Ato)   (o desconto do Ato Premiado entra só aqui).
// - Semestrais com cadeado aberto ficam sempre com o mesmo valor.
// - Centavos de arredondamento (parcela mensal × meses) fecham no Ato (se ele absorve) ou na Parcela Chaves.

export interface PmBloco {
  chave: string;        // 'ato' | 'mensal' | 'sem-<idx>' | 'chaves' | 'pos'
  valor: number;        // valor TOTAL atual do bloco
  teto: number;         // teto da política (Infinity para o Ato)
  piso: number;         // sinal mínimo para o Ato; 0 para as demais
  travado: boolean;     // cadeado fechado
  meses?: number;       // séries mensais (Mensal de Obra / Pós-Obra): quantidade de parcelas
}

export interface PmContexto {
  blocos: PmBloco[];                    // apenas blocos ativos, incluindo 'ato'
  totalPara: (ato: number) => number;   // quanto Ato + demais precisam somar com esse Ato
  tetoPara?: (chave: string, ato: number) => number; // teto do bloco para um dado Ato (base líquida)
}

export type PmResultado =
  | { tipo: 'aplicar'; valores: Record<string, number>; aviso?: string }
  | { tipo: 'modal'; modo: 'jogar' | 'descontar'; diferenca: number; valores: Record<string, number>; aviso?: string }
  | { tipo: 'bloqueado'; aviso?: string };

export type PmDestino = 'ato' | 'mensal' | 'semestrais' | 'chaves' | 'pos';

const r2 = (n: number) => Math.round(n * 100) / 100;
const ehSemestral = (k: string) => k.startsWith('sem-');

/** Valor que o motor realmente produz: séries mensais guardam a parcela com 2 casas. */
function realizado(b: PmBloco | undefined, v: number): number {
  if (b?.meses && b.meses > 0) return r2(r2(v / b.meses) * b.meses);
  return r2(v);
}

/** Unidades de redistribuição: cada parcela aberta, com as Semestrais abertas agrupadas numa só (ficam iguais). */
interface Unidade { chaves: string[]; valor: number; teto: number; piso: number }
function montarUnidades(blocos: PmBloco[], valores: Record<string, number>): Unidade[] {
  const unidades: Unidade[] = [];
  const sems = blocos.filter(b => ehSemestral(b.chave));
  blocos.filter(b => !ehSemestral(b.chave)).forEach(b => unidades.push({ chaves: [b.chave], valor: valores[b.chave], teto: b.teto, piso: b.piso }));
  if (sems.length > 0) {
    unidades.push({
      chaves: sems.map(b => b.chave),
      valor: sems.reduce((t, b) => t + valores[b.chave], 0),
      teto: sems.reduce((t, b) => t + b.teto, 0),
      piso: 0
    });
  }
  return unidades;
}

/** Grava o valor de cada unidade de volta em `valores` (Semestrais divididas em partes iguais, centavo para baixo). */
function gravarUnidades(unidades: Unidade[], valores: Record<string, number>) {
  unidades.forEach(u => {
    if (u.chaves.length === 1) { valores[u.chaves[0]] = r2(u.valor); return; }
    const cada = Math.floor((u.valor / u.chaves.length) * 100) / 100;
    u.chaves.forEach(k => { valores[k] = cada; });
  });
}

/** Enche as unidades proporcionalmente à MARGEM até o teto (water-filling). Devolve o que não coube. */
function encherPorMargem(unidades: Unidade[], extra: number): number {
  let sobra = extra;
  for (let i = 0; i < 20 && sobra > 0.004; i++) {
    const comMargem = unidades.filter(u => u.teto - u.valor > 0.005);
    if (comMargem.length === 0) break;
    const somaMargem = comMargem.reduce((t, u) => t + (u.teto - u.valor), 0);
    let usado = 0;
    comMargem.forEach(u => {
      const margem = u.teto - u.valor;
      const add = Math.min(margem, sobra * (margem / somaMargem));
      u.valor += add;
      usado += add;
    });
    sobra -= usado;
  }
  return Math.max(0, r2(sobra));
}

/** Retira das unidades proporcionalmente ao que cada uma tem acima do piso. Devolve o que faltou. */
function reduzirAtePiso(unidades: Unidade[], corte: number): number {
  let falta = corte;
  for (let i = 0; i < 20 && falta > 0.004; i++) {
    const comSaldo = unidades.filter(u => u.valor - u.piso > 0.005);
    if (comSaldo.length === 0) break;
    const somaSaldo = comSaldo.reduce((t, u) => t + (u.valor - u.piso), 0);
    let usado = 0;
    comSaldo.forEach(u => {
      const saldo = u.valor - u.piso;
      const cut = Math.min(saldo, falta * (saldo / somaSaldo));
      u.valor -= cut;
      usado += cut;
    });
    falta -= usado;
  }
  return Math.max(0, r2(falta));
}

/** Teto absoluto do Ato: todas as demais parcelas em R$ 0 (ponto fixo com o desconto do Ato Premiado). */
function tetoAbsolutoAto(ctx: PmContexto): number {
  let t = ctx.totalPara(0);
  let menor = Infinity;
  for (let i = 0; i < 12; i++) { t = Math.max(0, ctx.totalPara(t)); menor = Math.min(menor, t); }
  return r2(menor);
}

/**
 * Fecha o plano no centavo (Distribuído sempre exato):
 *  1. Semestrais abertas iguais; séries (Mensal/Pós-Obra) no valor realizado (parcela com 2 casas × meses).
 *  2. Resíduo vai para o Ato quando ele é o absorvedor — sem nunca furar o piso (sinal mínimo).
 *  3. Senão (ou se o Ato bateu no piso), para a Parcela Chaves aberta.
 *  4. Se as demais precisam diminuir e não há Chaves, tira 1 centavo por parcela de um grupo aberto
 *     (Semestrais, Mensal ou Pós-Obra) e o Ato recebe a diferença positiva que sobrar.
 *  O laço também resolve o caso em que o desconto do Ato Premiado (10% do Ato, arredondado) não deixa
 *  nenhum valor de Ato fechar exatamente — um centavo num grupo destrava a conta.
 */
function fecharNoCentavo(ctx: PmContexto, valores: Record<string, number>, protegidos: string[], atoAbsorve: boolean): Record<string, number> {
  const v = { ...valores };
  const bloco = (k: string) => ctx.blocos.find(b => b.chave === k);
  const pisoAto = bloco('ato')?.piso ?? 0;
  const livre = (k: string) => { const b = bloco(k); return !!b && !b.travado && !protegidos.includes(k); };

  const semsAbertas = ctx.blocos.filter(b => ehSemestral(b.chave) && livre(b.chave));
  if (semsAbertas.length > 1) {
    const soma = semsAbertas.reduce((t, b) => t + v[b.chave], 0);
    const cada = Math.floor((soma / semsAbertas.length) * 100) / 100;
    semsAbertas.forEach(b => { v[b.chave] = cada; });
  }
  ctx.blocos.filter(b => b.chave !== 'ato').forEach(b => { v[b.chave] = realizado(b, v[b.chave]); });

  const somaOutros = () => ctx.blocos.filter(b => b.chave !== 'ato').reduce((t, b) => t + v[b.chave], 0);
  const gapCom = (ato: number) => r2(ctx.totalPara(ato) - ato - somaOutros());
  // Ato absorve o gap (ponto fixo por causa do desconto do Ato Premiado); devolve true se fechou exato.
  const ajustarAto = () => {
    for (let i = 0; i < 12; i++) {
      const g = gapCom(v.ato);
      if (Math.abs(g) < 0.005) return true;
      v.ato = r2(Math.max(0, v.ato + g));
    }
    return Math.abs(gapCom(v.ato)) < 0.005;
  };
  // Grupos que podem ceder centavos mantendo a regra (Semestrais iguais; séries por parcela).
  const grupos: { chaves: string[]; meses: number }[] = [];
  if (semsAbertas.length > 0) grupos.push({ chaves: semsAbertas.map(b => b.chave), meses: 1 });
  (['mensal', 'pos'] as const).forEach(k => { const b = bloco(k); if (b && livre(k) && (b.meses ?? 0) > 0) grupos.push({ chaves: [k], meses: b.meses! }); });

  for (let tentativa = 0; tentativa < 12; tentativa++) {
    let gap = gapCom(v.ato);
    if (Math.abs(gap) < 0.005) return v;

    // 2. Ato absorvedor, respeitando o piso
    if (atoAbsorve) {
      if (ajustarAto() && v.ato >= pisoAto - 0.005) return v;
      if (v.ato < pisoAto) v.ato = pisoAto;
      gap = gapCom(v.ato);
      if (Math.abs(gap) < 0.005) return v;
    }

    // 3. Parcela Chaves aberta
    if (livre('chaves') && v.chaves + gap >= 0) {
      v.chaves = r2(v.chaves + gap);
      if (Math.abs(gapCom(v.ato)) < 0.005) return v;
      gap = gapCom(v.ato);
    }

    if (gap > 0) {
      // 4a. faltou distribuir: o Ato sobe (subir nunca fura o piso)
      if (ajustarAto()) return v;
      gap = gapCom(v.ato);
      if (gap > 0) {
        // nenhum Ato fecha exato (arredondamento do Ato Premiado): 1 centavo a mais por parcela de um grupo destrava
        const grupoMais = grupos[0];
        if (!grupoMais) return v;
        grupoMais.chaves.forEach(k => {
          if (grupoMais.meses > 1) v[k] = r2((r2(v[k] / grupoMais.meses) + 0.01) * grupoMais.meses);
          else v[k] = r2(v[k] + 0.01);
        });
        continue;
      }
    }
    // 4b. as demais precisam diminuir: 1 centavo (ou o necessário) por parcela de um grupo aberto
    const grupo = grupos.find(g => g.chaves.every(k => v[k] > 0.005));
    if (!grupo) { ajustarAto(); return v; }
    const parcelas = grupo.chaves.length * grupo.meses;
    const centavos = Math.max(1, Math.ceil((Math.abs(gap) * 100) / parcelas));
    grupo.chaves.forEach(k => {
      if (grupo.meses > 1) v[k] = r2(Math.max(0, r2(v[k] / grupo.meses) - centavos / 100) * grupo.meses);
      else v[k] = r2(Math.max(0, v[k] - centavos / 100));
    });
  }
  ajustarAto();
  return v;
}

/**
 * Aplica a alteração manual de um bloco e redistribui entre os blocos de cadeado aberto.
 * Diminuir: enche as parcelas abertas até o teto (pela margem); sobra -> Ato aberto, ou modal "jogar".
 * Aumentar: retira das abertas (e do Ato aberto) até o piso; se faltar -> modal "descontar".
 */
export function redistribuirParcelamentoMorar(ctx: PmContexto, chave: string, novoValor: number, msgPisoSinal: string): PmResultado {
  const X = ctx.blocos.find(b => b.chave === chave);
  const ato = ctx.blocos.find(b => b.chave === 'ato');
  if (!X || !ato) return { tipo: 'bloqueado' };

  let aviso: string | undefined;
  let novo = r2(Math.max(X.piso, novoValor));
  if (chave === 'ato') {
    if (novoValor < ato.piso - 0.005) {
      aviso = msgPisoSinal;
      if (ato.valor <= ato.piso + 0.005) return { tipo: 'bloqueado', aviso };
    }
    const tetoAbs = tetoAbsolutoAto(ctx);
    if (novo > tetoAbs + 0.005) { novo = tetoAbs; aviso = 'O Sinal não pode passar do total da negociação.'; }
  }

  // Os tetos dependem do Ato (base líquida). Calcula com o Ato de referência e, se o Ato final mudar, refaz
  // com os tetos do Ato final — assim nenhuma série passa do % da Política no gráfico.
  let atoRef = chave === 'ato' ? novo : ato.valor;
  let res: PmResultado = { tipo: 'bloqueado' };
  for (let i = 0; i < 4; i++) {
    const ctxT: PmContexto = ctx.tetoPara
      ? { ...ctx, blocos: ctx.blocos.map(b => (b.chave === 'ato' ? b : { ...b, teto: ctx.tetoPara!(b.chave, atoRef) })) }
      : ctx;
    res = nucleoRedistribuicao(ctxT, chave, novo, aviso);
    if (res.tipo !== 'aplicar' || !ctx.tetoPara) return res;
    const atoFinal = res.valores.ato;
    if (Math.abs(atoFinal - atoRef) < 0.005) return res;
    atoRef = atoFinal;
  }
  return res;
}

/**
 * Clique nos botões − / + (passo inteiro, ex.: R$ 1.000). Se o passo inteiro ultrapassa o limite possível —
 * mesmo quebrado em centavos — o campo ENCOSTA exatamente nesse limite em vez de abrir o modal ou bloquear:
 *  - limite de redistribuição: o maior/menor valor que as parcelas abertas ainda absorvem (até 100% do teto
 *    da política, ou até o piso), achado por busca binária no centavo;
 *  - teto da política do próprio bloco (Mensal, Semestral, Chaves, Pós-Obra) ao subir;
 *  - piso do bloco (R$ 0,00, ou o Sinal Mínimo no Ato) ao descer.
 * Só quando o campo JÁ está cravado no limite, o próximo clique segue a regra normal (modal / aviso).
 */
export function redistribuirPorPasso(ctx: PmContexto, chave: string, alvo: number, msgPisoSinal: string): PmResultado {
  const X = ctx.blocos.find(b => b.chave === chave);
  if (!X) return { tipo: 'bloqueado' };
  const atual = r2(X.valor);
  const sobe = alvo > atual;
  const perto = (a: number, b: number) => Math.abs(a - b) < 0.0095;

  // 1. Teto da política do próprio bloco: encosta nele antes de passar (o próximo clique passa, em vermelho).
  let alvoPasso = r2(alvo);
  if (sobe && chave !== 'ato' && Number.isFinite(X.teto)) {
    const teto = r2(X.teto);
    if (atual < teto - 0.009 && alvoPasso > teto + 0.009) alvoPasso = teto;
  }
  // 2. Piso do bloco: encosta nele (R$ 0,00 ou Sinal Mínimo).
  if (!sobe && alvoPasso < X.piso && atual > X.piso + 0.009) alvoPasso = r2(X.piso);

  const direto = redistribuirParcelamentoMorar(ctx, chave, alvoPasso, msgPisoSinal);
  if (direto.tipo === 'aplicar' || perto(alvoPasso, atual)) return direto;

  // 3. O passo inteiro não cabe: busca (no centavo) o último valor que ainda redistribui sem modal/bloqueio.
  const cabe = (v: number) => redistribuirParcelamentoMorar(ctx, chave, v, msgPisoSinal).tipo === 'aplicar';
  let ok = Math.round(atual * 100);
  let falha = Math.round(alvoPasso * 100);
  while (Math.abs(falha - ok) > 1) {
    const meio = Math.round((ok + falha) / 2);
    if (cabe(meio / 100)) ok = meio; else falha = meio;
  }
  const limite = ok / 100;
  // Já cravado no limite (folga só de centavos de arredondamento): o clique segue a regra normal
  // (modal "para onde jogar/descontar" ou aviso do piso).
  if (Math.abs(limite - atual) < 0.5) return direto;
  return redistribuirParcelamentoMorar(ctx, chave, limite, msgPisoSinal);
}

function nucleoRedistribuicao(ctx: PmContexto, chave: string, novo: number, aviso: string | undefined): PmResultado {
  const X = ctx.blocos.find(b => b.chave === chave)!;
  const ato = ctx.blocos.find(b => b.chave === 'ato')!;
  const valores: Record<string, number> = Object.fromEntries(ctx.blocos.map(b => [b.chave, b.valor]));
  valores[chave] = novo;
  const atoAbsorve = chave !== 'ato' && !ato.travado;
  const abertas = ctx.blocos.filter(b => b.chave !== 'ato' && b.chave !== chave && !b.travado);
  const unidades = montarUnidades(abertas, valores);

  // > 0: as demais precisam RECEBER (o campo diminuiu); < 0: precisam CEDER (o campo aumentou)
  const somaNaoAto = ctx.blocos.filter(b => b.chave !== 'ato').reduce((t, b) => t + b.valor, 0);
  const delta = chave === 'ato'
    ? r2(ctx.totalPara(novo) - novo - somaNaoAto)
    : r2(X.valor - novo);

  if (delta > 0.004) {
    const sobra = encherPorMargem(unidades, delta);
    gravarUnidades(unidades, valores);
    if (sobra > 0.004) {
      if (atoAbsorve) {
        valores.ato = r2(valores.ato + sobra); // o Ato não tem teto próprio além do total do negócio
      } else {
        return { tipo: 'modal', modo: 'jogar', diferenca: sobra, valores, aviso };
      }
    }
  } else if (delta < -0.004) {
    const fontes = [...unidades];
    const unidadeAto: Unidade = { chaves: ['ato'], valor: valores.ato, teto: Infinity, piso: ato.piso };
    if (atoAbsorve) fontes.push(unidadeAto);
    const faltou = reduzirAtePiso(fontes, -delta);
    gravarUnidades(fontes, valores);
    if (faltou > 0.004) {
      return { tipo: 'modal', modo: 'descontar', diferenca: faltou, valores, aviso };
    }
  }

  return { tipo: 'aplicar', valores: fecharNoCentavo(ctx, valores, [chave], atoAbsorve), aviso };
}

/**
 * Resolve o modal "para onde jogar / de onde descontar" com ATRIBUIÇÃO DIRETA, sem passar por teto, rateio
 * ou fechamento automático:
 *  - parte do estado ATUAL (snapshot de antes do modal), não do plano parcial calculado ao abrir o modal —
 *    esse plano enchia as parcelas abertas até o teto recalculado com o Sinal novo (o teto da Chaves sobe
 *    quando o Desconto do Ato Premiado cai) e era daí que vinha o "vazamento" na Parcela Chaves;
 *  - aplica no campo de origem o valor pedido e joga 100% da diferença no destino escolhido;
 *  - todos os blocos que NÃO são origem nem destino ficam idênticos ao centavo;
 *  - o destino pode passar do teto da política (fica vermelho): foi escolha explícita do usuário.
 * Semestrais: total = soma atual + diferença; base = floor(total / N) nas N−1 primeiras e o resto na última.
 * Só se o destino não conseguir receber tudo (sem saldo para descontar, ou centavo que uma série de parcela
 * × meses não fecha), o resíduo volta para o próprio campo de origem; o Ato só entra como último recurso.
 */
export function aplicarDestinoParcelamentoMorar(
  ctx: PmContexto, valores: Record<string, number>, origem: string,
  _modo: 'jogar' | 'descontar', _diferenca: number, destino: PmDestino
): { valores: Record<string, number>; aviso?: string } {
  const bloco = (k: string) => ctx.blocos.find(b => b.chave === k);
  const outros = ctx.blocos.filter(b => b.chave !== 'ato');

  // 1. Snapshot do estado atual + valor pedido no campo de origem
  const v: Record<string, number> = Object.fromEntries(ctx.blocos.map(b => [b.chave, b.chave === 'ato' ? r2(b.valor) : realizado(b, b.valor)]));
  if (origem in valores) v[origem] = origem === 'ato' ? r2(valores[origem]) : realizado(bloco(origem), valores[origem]);

  const somaOutros = () => outros.reduce((t, b) => t + v[b.chave], 0);
  const gap = () => r2(ctx.totalPara(v.ato) - v.ato - somaOutros()); // > 0 falta distribuir; < 0 sobrou

  // Absorve o gap atual num único bloco (respeitando o piso dele); devolve se fechou exato.
  const absorver = (k: string): boolean => {
    const b = bloco(k);
    if (!b) return false;
    if (k === 'ato') {
      for (let i = 0; i < 12; i++) {
        const g = gap();
        if (Math.abs(g) < 0.005) return true;
        const novo = r2(Math.max(b.piso, v.ato + g));
        if (Math.abs(novo - v.ato) < 0.005) return false;
        v.ato = novo;
      }
      return Math.abs(gap()) < 0.005;
    }
    const g = gap();
    if (Math.abs(g) < 0.005) return true;
    const alvo = Math.max(b.piso, v[k] + g);
    v[k] = b.meses && b.meses > 0 ? r2((Math.round((alvo / b.meses) * 100) / 100) * b.meses) : r2(alvo);
    return Math.abs(gap()) < 0.005;
  };

  // 2. 100% da diferença no destino escolhido
  if (destino === 'semestrais') {
    const sems = ctx.blocos.filter(b => ehSemestral(b.chave) && b.chave !== origem);
    const n = sems.length;
    if (n > 0) {
      const somaAtual = sems.reduce((t, b) => t + v[b.chave], 0);
      const total = r2(Math.max(0, somaAtual + gap()));
      const base = Math.floor((total / n) * 100) / 100;
      const resto = r2(total - base * n);
      sems.forEach((b, i) => { v[b.chave] = i === n - 1 ? r2(base + resto) : base; });
    }
  } else {
    absorver(destino);
  }

  // 3. Resíduo que o destino não recebeu: volta para a origem; o Ato só como último recurso.
  let aviso: string | undefined;
  if (Math.abs(gap()) >= 0.005) {
    if (Math.abs(gap()) >= 0.5) aviso = 'O campo escolhido não tinha saldo suficiente: a alteração foi aplicada só até onde deu.';
    if (origem !== destino) absorver(origem);
    if (Math.abs(gap()) >= 0.005 && origem !== 'ato' && destino !== 'ato') absorver('ato');
  }
  return { valores: v, aviso };
}
