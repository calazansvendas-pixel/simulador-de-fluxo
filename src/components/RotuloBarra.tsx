import React from 'react';

// Largura mínima (px) das barras horizontais com valor > 0 (Bar minPointSize): garante espaço para
// o rótulo caber inteiro dentro da barra, mesmo nas muito curtas (ex.: "ITBI (Obra)" com 3,17%).
// Barra com valor zero continua sem largura.
export const larguraMinimaBarra = (valor: number | null | undefined): number => (valor ? 48 : 0);

// Rótulo de valor para barras horizontais do Recharts (usar em <LabelList content={...} />).
// Fica DENTRO da barra, colado na extremidade direita (6px de recuo), em branco e peso regular.
// `formatar` converte o valor bruto em texto quando o dataKey não é um texto pronto.
export const rotuloBarraDireita = (fontSize: number, formatar?: (v: number) => string) => (props: any): React.ReactElement | null => {
  const { x, y, width, height, value } = props;
  if (value === undefined || value === null || value === '') return null;
  const texto = formatar ? formatar(Number(value)) : String(value);
  const fim = Number(x) + Number(width);
  return (
    <text
      x={fim - 6}
      y={Number(y) + Number(height) / 2}
      dominantBaseline="central"
      textAnchor="end"
      fontSize={fontSize}
      fontWeight="normal"
      fill="#FFFFFF"
    >
      {texto}
    </text>
  );
};
