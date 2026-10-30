import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Product } from '../types';

interface NewProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveNewProduct: (product: Product) => void;
}

export const NewProductModal: React.FC<NewProductModalProps> = ({
  isOpen,
  onClose,
  onSaveNewProduct
}) => {
  const [name, setName] = useState<string>('');
  const [deliveryDatePhase1, setDeliveryDatePhase1] = useState<string>('');
  const [deliveryDatePhase2, setDeliveryDatePhase2] = useState<string>('');
  const [optionsText, setOptionsText] = useState<string>('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    // UUID (não um id de texto arbitrário): o Supabase exige esse formato na coluna
    // empreendimentos.id, senão a sincronização é silenciosamente ignorada.
    const id = crypto.randomUUID();
    const optionsList = optionsText.trim()
      ? optionsText.split(',').map(o => o.trim()).filter(o => o !== '')
      : ['Sinal em 48X c/ Morar', 'Sinal em 72X c/ Banco Direto'];

    // Valores padrão apenas para inicializar a condição — a política de crédito de
    // verdade (sinal mínimo, riscos, prazos, taxas etc.) é configurada por condição
    // comercial na tela de Políticas & Empreendimentos, não no cadastro inicial.
    const conditions = optionsList.map((optName, idx) => ({
      id: `cond_${id}_${idx + 1}`,
      name: optName,
      numParcelas: 60,
      sinalMinimo: 'R$ 2.000,00',
      riscoRendaPct: 30,
      riscoImovelPct: 25,
      mesesTabela1: 36,
      taxaJuros1: 0.0,
      mesesTabela2: 72,
      taxaJuros2: 1.0,
      policy: `POLÍTICA COMERCIAL DA CONDIÇÃO ${optName.toUpperCase()}:\n- Regras gerais e diretrizes para aprovação.`
    }));

    const newProd: Product = {
      id,
      name: name.trim(),
      deliveryDate: deliveryDatePhase1 || deliveryDatePhase2 || '',
      deliveryDatePhase1,
      deliveryDatePhase2,
      isFeatured: false,
      conditions,
      tableInfo: { validFrom: '', validTo: '', fileName: '', headers: [], rows: [], active: false }
    };

    onSaveNewProduct(newProd);

    // Reset state
    setName('');
    setDeliveryDatePhase1('');
    setDeliveryDatePhase2('');
    setOptionsText('');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-base font-bold text-slate-900 font-heading">
            Cadastrar Novo Empreendimento
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Nome do Empreendimento *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Vista do Horizonte"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:border-morar-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Previsão de Entrega - 1ª Fase
              </label>
              <input
                type="date"
                value={deliveryDatePhase1}
                onChange={(e) => setDeliveryDatePhase1(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:border-morar-600 cursor-pointer"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Previsão de Entrega - 2ª Fase <span className="font-normal text-slate-400">(Opcional)</span>
              </label>
              <input
                type="date"
                value={deliveryDatePhase2}
                onChange={(e) => setDeliveryDatePhase2(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:border-morar-600 cursor-pointer"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Condições Comerciais (separadas por vírgula)
            </label>
            <input
              type="text"
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder="Sinal em 48X c/ Morar, Sinal em 72X c/ Banco Direto"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:border-morar-600"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-morar-600 hover:bg-morar-700 text-white rounded-xl font-semibold text-xs cursor-pointer"
            >
              Criar Empreendimento
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
