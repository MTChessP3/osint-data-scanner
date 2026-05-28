'use client';

import { useEffect } from 'react';
import { Shield, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[OSINT Scanner] Client error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b0f19] text-slate-200 p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="p-4 bg-red-900/20 rounded-2xl border border-red-800/30">
            <AlertTriangle className="w-12 h-12 text-red-400" />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white flex items-center justify-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            Error en la Aplicacion
          </h2>
          <p className="text-sm text-slate-400">
            Ha ocurrido un error inesperado. Esto puede deberse a un problema temporal de carga.
          </p>
          {error?.message && (
            <p className="text-xs text-slate-600 bg-[#111827] p-2 rounded border border-[#1e293b] font-mono break-all">
              {error.message}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={() => reset()}
            className="bg-blue-700 hover:bg-blue-800 text-white"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reintentar
          </Button>
          <Button
            onClick={() => window.location.href = '/'}
            variant="outline"
            className="border-[#1e293b] text-slate-300 hover:bg-[#1a2235]"
          >
            Recargar Pagina
          </Button>
        </div>

        <p className="text-[10px] text-slate-600">
          Si el problema persiste, intenta limpiar el cache del navegador (Ctrl+Shift+R) o abrir en una ventana de incognito.
        </p>
      </div>
    </div>
  );
}
