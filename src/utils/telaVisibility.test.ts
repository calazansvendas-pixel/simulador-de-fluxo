import { describe, it, expect } from 'bun:test';
import { Cargo, TelaVisibilitySettings } from '../types';
import {
  DEFAULT_TELA_VISIBILITY_SETTINGS,
  cadeiaHierarquicaDeCargos,
  aplicarHerancaHierarquicaDeVisibilidade
} from './telaVisibility';

const vis = (overrides: Partial<TelaVisibilitySettings> = {}): TelaVisibilitySettings => ({
  ...DEFAULT_TELA_VISIBILITY_SETTINGS,
  ...overrides
});

describe('cadeiaHierarquicaDeCargos', () => {
  it('Corretor sobe até Gerente', () => {
    expect(cadeiaHierarquicaDeCargos('Corretor')).toEqual(['Corretor', 'Gerente']);
  });

  it('Corretor Parceiro sobe até Gerente', () => {
    expect(cadeiaHierarquicaDeCargos('Corretor Parceiro')).toEqual(['Corretor Parceiro', 'Gerente']);
  });

  it('Gerente não tem superior mapeado (topo desta cadeia)', () => {
    expect(cadeiaHierarquicaDeCargos('Gerente')).toEqual(['Gerente']);
  });

  it('cargo sem hierarquia mapeada retorna cadeia de um único elemento', () => {
    expect(cadeiaHierarquicaDeCargos('Administrador' as Cargo)).toEqual(['Administrador']);
  });
});

describe('aplicarHerancaHierarquicaDeVisibilidade', () => {
  const cadeiaCorretor: Cargo[] = ['Corretor', 'Gerente'];
  const cadeiaParceiro: Cargo[] = ['Corretor Parceiro', 'Gerente'];

  it('Regra do SIM INDIVIDUAL: Gerente Vê + Corretor Vê -> Corretor vê', () => {
    const efetivo = aplicarHerancaHierarquicaDeVisibilidade(
      {
        'Corretor': vis({ mostrarBloco1: true }),
        'Gerente': vis({ mostrarBloco1: true })
      },
      cadeiaCorretor
    );
    expect(efetivo.mostrarBloco1).toBe(true);
  });

  it('Regra do SIM INDIVIDUAL: Gerente Vê + Corretor Não Vê -> Corretor não vê', () => {
    const efetivo = aplicarHerancaHierarquicaDeVisibilidade(
      {
        'Corretor': vis({ mostrarBloco1: false }),
        'Gerente': vis({ mostrarBloco1: true })
      },
      cadeiaCorretor
    );
    expect(efetivo.mostrarBloco1).toBe(false);
  });

  it('Regra do NÃO: Gerente Não Vê -> Corretor automaticamente Não Vê, mesmo com config individual "visível"', () => {
    const efetivo = aplicarHerancaHierarquicaDeVisibilidade(
      {
        'Corretor': vis({ mostrarBloco1: true }),
        'Gerente': vis({ mostrarBloco1: false })
      },
      cadeiaCorretor
    );
    expect(efetivo.mostrarBloco1).toBe(false);
  });

  it('Regra do NÃO também vale para Corretor Parceiro', () => {
    const efetivo = aplicarHerancaHierarquicaDeVisibilidade(
      {
        'Corretor Parceiro': vis({ mostrarBloco2: true }),
        'Gerente': vis({ mostrarBloco2: false })
      },
      cadeiaParceiro
    );
    expect(efetivo.mostrarBloco2).toBe(false);
  });

  it('Regra do SIM INDIVIDUAL também vale para Corretor Parceiro (Gerente vê, Parceiro não vê -> oculto)', () => {
    const efetivo = aplicarHerancaHierarquicaDeVisibilidade(
      {
        'Corretor Parceiro': vis({ mostrarBloco3: false }),
        'Gerente': vis({ mostrarBloco3: true })
      },
      cadeiaParceiro
    );
    expect(efetivo.mostrarBloco3).toBe(false);
  });

  it('cargo sem linha configurada no banco usa o padrão (tudo visível) naquele nível', () => {
    // Nem Corretor nem Gerente têm configuração salva -> ambos caem no padrão
    // "mostra tudo", resultado final também mostra tudo.
    const efetivo = aplicarHerancaHierarquicaDeVisibilidade({}, cadeiaCorretor);
    expect(efetivo).toEqual(DEFAULT_TELA_VISIBILITY_SETTINGS);
  });

  it('cada bloco é avaliado independentemente', () => {
    const efetivo = aplicarHerancaHierarquicaDeVisibilidade(
      {
        'Corretor': vis({ mostrarBloco1: true, mostrarBloco2: false, mostrarBloco3: true, mostrarBloco4: false }),
        'Gerente': vis({ mostrarBloco1: true, mostrarBloco2: true, mostrarBloco3: false, mostrarBloco4: false })
      },
      cadeiaCorretor
    );
    expect(efetivo).toEqual({
      mostrarBloco1: true,  // Gerente true && Corretor true
      mostrarBloco2: false, // Gerente true && Corretor false
      mostrarBloco3: false, // Gerente false veta, ignora Corretor true (Regra do NÃO)
      mostrarBloco4: false  // ambos false
    });
  });

  it('cargo sem hierarquia (cadeia de 1 elemento) simplesmente usa a própria configuração', () => {
    const efetivo = aplicarHerancaHierarquicaDeVisibilidade(
      { 'Gerente': vis({ mostrarBloco1: false }) },
      ['Gerente']
    );
    expect(efetivo.mostrarBloco1).toBe(false);
  });
});
