import { describe, it, expect } from 'bun:test';
import { formatarTelefoneBR } from './telefone';

describe('formatarTelefoneBR', () => {
  it('celular 11 dígitos: DD XXXXX-XXXX', () => {
    expect(formatarTelefoneBR('27999999999')).toBe('27 99999-9999');
    expect(formatarTelefoneBR('(27) 99999-9999')).toBe('27 99999-9999');
  });
  it('remove o 55 na frente', () => {
    expect(formatarTelefoneBR('+55 27 99999-9999')).toBe('27 99999-9999');
    expect(formatarTelefoneBR('5527999999999')).toBe('27 99999-9999');
    expect(formatarTelefoneBR('552733334444')).toBe('27 3333-4444');
  });
  it('fixo 10 dígitos: DD XXXX-XXXX', () => {
    expect(formatarTelefoneBR('2733334444')).toBe('27 3333-4444');
  });
  it('vazio/indefinido não quebra', () => {
    expect(formatarTelefoneBR('')).toBe('');
    expect(formatarTelefoneBR(undefined)).toBe('');
    expect(formatarTelefoneBR(null)).toBe('');
    expect(formatarTelefoneBR('abc')).toBe('');
  });
});
