import React from 'react';
import { Info, CheckCircle2 } from 'lucide-react';

interface ToastProps {
  message: string | null;
}

export const Toast: React.FC<ToastProps> = ({ message }) => {
  if (!message) return null;

  const isSuccess = message.startsWith('✓') || message.toLowerCase().includes('sucesso') || message.toLowerCase().includes('salvas');

  return (
    <div className={`fixed bottom-5 right-5 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 transition-all duration-300 z-50 animate-bounce-short border ${
      isSuccess 
        ? 'bg-emerald-950/95 border-emerald-500/40 text-emerald-50 shadow-emerald-950/30' 
        : 'bg-slate-900 border-slate-700 text-white'
    }`}>
      <div className={`p-1.5 rounded-lg shrink-0 ${
        isSuccess ? 'bg-emerald-500/20 text-emerald-400' : 'bg-morar-500/20 text-morar-300'
      }`}>
        {isSuccess ? <CheckCircle2 className="w-4 h-4" /> : <Info className="w-4 h-4" />}
      </div>
      <span className="text-xs font-semibold">{message}</span>
    </div>
  );
};

