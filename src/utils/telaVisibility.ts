import { Cargo, TelaVisibilitySettings, TelaVisibilitySettingsByKind } from '../types';

// Configuração do que cada cargo enxerga NA TELA (fora do PDF) enquanto usa o
// sistema, editável na página "Configurar Visibilidade dos Quadros" — uma por
// tipo de condição comercial. Os padrões abaixo (tudo visível) são o que vale
// enquanto o Administrador não restringir um cargo específico.
export const DEFAULT_TELA_VISIBILITY_SETTINGS: TelaVisibilitySettings = {
  mostrarBloco1: true,
  mostrarBloco2: true,
  mostrarBloco3: true,
  mostrarBloco4: true,
};

export const DEFAULT_TELA_VISIBILITY_SETTINGS_BY_KIND: TelaVisibilitySettingsByKind = {
  'banco-direto': { ...DEFAULT_TELA_VISIBILITY_SETTINGS },
  'sinal-morar': { ...DEFAULT_TELA_VISIBILITY_SETTINGS },
  'parcelamento-morar': { ...DEFAULT_TELA_VISIBILITY_SETTINGS },
  'banco-direto-comissao-apartada': { ...DEFAULT_TELA_VISIBILITY_SETTINGS },
  'sinal-morar-comissao-apartada': { ...DEFAULT_TELA_VISIBILITY_SETTINGS },
  'simulador-simplificado': { ...DEFAULT_TELA_VISIBILITY_SETTINGS },
  'simulador-simplificado-comissao-apartada': { ...DEFAULT_TELA_VISIBILITY_SETTINGS },
};

// A configuração em si (quem pode editar o quê, por cargo) mora no banco —
// ver src/services/telaVisibilidadeService.ts.

// ---------------------------------------------------------------------------
// Herança hierárquica restritiva (top-down) entre Gerente e os corretores
// ---------------------------------------------------------------------------
// A permissão do cargo superior atua como TETO de acesso para quem está
// abaixo dele: um quadro só aparece para o subordinado se TODOS os cargos da
// cadeia (o próprio cargo + cada superior mapeado) o liberarem.
//   - Regra do NÃO: Gerente com o bloco oculto => oculto para Corretor e
//     Corretor Parceiro, mesmo que a configuração individual deles diga "visível".
//   - Regra do SIM INDIVIDUAL: Gerente com o bloco visível => prevalece a
//     configuração individual do próprio cargo (pode ser visível ou oculta).
//
// Um cargo sem entrada aqui não tem superior mapeado para este fim (ex.:
// Gerente, que é o topo desta cadeia específica) — sua cadeia hierárquica
// tem um único elemento e a herança não se aplica.
export const CARGO_SUPERIOR_HIERARQUICO: Partial<Record<Cargo, Cargo>> = {
  'Corretor': 'Gerente',
  'Corretor Parceiro': 'Gerente',
};

// Monta a cadeia [cargo, superior imediato, superior do superior, ...],
// seguindo CARGO_SUPERIOR_HIERARQUICO até não haver mais superior mapeado (ou
// até detectar um ciclo, por segurança — não deveria ocorrer com o mapa acima).
export function cadeiaHierarquicaDeCargos(cargo: Cargo): Cargo[] {
  const cadeia: Cargo[] = [cargo];
  let atual = cargo;
  while (true) {
    const superior = CARGO_SUPERIOR_HIERARQUICO[atual];
    if (!superior || cadeia.includes(superior)) break;
    cadeia.push(superior);
    atual = superior;
  }
  return cadeia;
}

// Combina a configuração de cada cargo da cadeia hierárquica num único
// resultado "efetivo": cada bloco só fica visível (true) se TODOS os cargos
// da cadeia o liberarem — é essa curto-circuitagem em AND que implementa a
// Regra do NÃO (um único cargo com o bloco oculto veta todo mundo abaixo
// dele) e a Regra do SIM INDIVIDUAL (com todos os superiores liberando,
// prevalece a própria configuração do cargo). Um cargo sem configuração
// salva no banco (ausente de `configsPorCargo`) usa o padrão "mostra tudo"
// só naquele nível — mesmo comportamento de sempre quando não há restrição
// cadastrada.
export function aplicarHerancaHierarquicaDeVisibilidade(
  configsPorCargo: Partial<Record<Cargo, TelaVisibilitySettings>>,
  cadeia: Cargo[]
): TelaVisibilitySettings {
  const blocos = ['mostrarBloco1', 'mostrarBloco2', 'mostrarBloco3', 'mostrarBloco4'] as const;
  const efetivo = { ...DEFAULT_TELA_VISIBILITY_SETTINGS };
  const [cargoAtual] = cadeia;
  for (const bloco of blocos) {
    efetivo[bloco] = cadeia.every(cargoDaCadeia => {
      const settings = configsPorCargo[cargoDaCadeia] ?? DEFAULT_TELA_VISIBILITY_SETTINGS;
      return settings[bloco];
    });

    // Log de auditoria: só dispara quando a herança de fato MUDA o resultado
    // que o próprio cargo teria isoladamente (a config individual dizia
    // "visível", mas um superior da cadeia vetou) — é o caso que mais importa
    // rastrear em produção, já que altera o que a pessoa vê na tela.
    const configPropria = configsPorCargo[cargoAtual] ?? DEFAULT_TELA_VISIBILITY_SETTINGS;
    if (configPropria[bloco] && !efetivo[bloco]) {
      const cargoQueVetou = cadeia.find(c => !((configsPorCargo[c] ?? DEFAULT_TELA_VISIBILITY_SETTINGS)[bloco]));
      console.debug(
        `[visibilidade-hierarquica] ${bloco} de "${cargoAtual}" vetado pela Regra do NÃO — ` +
        `cargo superior "${cargoQueVetou}" tem este quadro oculto (cadeia: ${cadeia.join(' -> ')}).`
      );
    }
  }
  return efetivo;
}
