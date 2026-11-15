/**
 * Formata um telefone brasileiro no padrão "DD XXXXX-XXXX" (celular, 11 dígitos) ou "DD XXXX-XXXX" (fixo, 10 dígitos).
 * Limpa qualquer caractere não numérico e remove o código do país (55) quando vier na frente.
 * Vazio/indefinido/inválido nunca quebra o layout: devolve '' (ou os dígitos soltos, quando não fecha 10/11).
 */
export function formatarTelefoneBR(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  let d = String(valor).replace(/\D/g, '');
  if (!d) return '';
  d = d.replace(/^0+/, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return `${d.slice(0, 2)} ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 2)} ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}
