'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, QrCode, Copy, CheckCircle2, AlertTriangle, ArrowLeft, KeyRound } from 'lucide-react';

export default function SetupMfaPage() {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState('');

  // MFA setup state
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [mfaActivated, setMfaActivated] = useState(false);
  const [updatedConfig, setUpdatedConfig] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);

  useEffect(() => {
    fetch('/api/auth/session')
      .then(res => res.json())
      .then(data => {
        if (!data.authenticated) {
          router.push('/login');
        } else {
          setAuthenticated(true);
        }
      })
      .catch(() => router.push('/login'));
  }, [router]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/auth/mfa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Error al generar código QR');
        return;
      }
      setQrCodeDataUrl(data.qrCodeDataUrl);
      setSecret(data.secret);
      setOtpauthUrl(data.otpauthUrl);
    } catch (err: any) {
      setError('Error de conexión');
    } finally {
      setGenerating(false);
    }
  };

  const handleVerifyAndActivate = async () => {
    setVerifying(true);
    setError('');
    try {
      const res = await fetch('/api/auth/mfa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify-and-activate', code: verifyCode.replace(/\s/g, ''), secret }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Código inválido');
        return;
      }
      setMfaActivated(true);
      setUpdatedConfig(data.updatedConfig);
    } catch (err: any) {
      setError('Error de conexión');
    } finally {
      setVerifying(false);
    }
  };

  const copyToClipboard = async (text: string, type: 'secret' | 'config') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'secret') {
        setCopiedSecret(true);
        setTimeout(() => setCopiedSecret(false), 2000);
      } else {
        setCopiedConfig(true);
        setTimeout(() => setCopiedConfig(false), 2000);
      }
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#1a1f36' }}>
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(245,158,11,0.3)', borderTopColor: '#f59e0b' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ background: '#1a1f36' }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.push('/')}
            className="p-2 rounded-lg transition-colors text-slate-400 hover:text-white"
            style={{ hoverBackground: '#252b44' }}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#f59e0b' }}>
              <KeyRound className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Configuración de MFA</h1>
              <p className="text-sm text-slate-400">Autenticación Multifactor con TOTP</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Success state */}
        {mfaActivated ? (
          <div className="rounded-2xl p-8" style={{ background: '#252b44', border: '1px solid rgba(34,197,94,0.3)' }}>
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ background: 'rgba(34,197,94,0.1)', border: '2px solid rgba(34,197,94,0.3)' }}>
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
              <h2 className="text-lg font-bold text-white">MFA Activado Exitosamente</h2>
              <p className="text-sm text-slate-400 mt-1">
                Su cuenta ahora está protegida con autenticación multifactor
              </p>
            </div>

            <div className="rounded-xl p-5 mb-6" style={{ background: '#1a1f36', border: '1px solid #374151' }}>
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2" style={{ color: '#f59e0b' }}>
                <AlertTriangle className="w-4 h-4" />
                IMPORTANTE: Guardar configuración en Vercel
              </h3>
              <p className="text-sm text-slate-300 mb-4">
                Para que MFA persista entre despliegues, actualice la variable de entorno{' '}
                <code className="px-1.5 py-0.5 rounded text-xs" style={{ background: '#252b44', color: '#f59e0b' }}>AUTH_USERS</code>{' '}
                en la configuración de Vercel con el siguiente valor:
              </p>

              <div className="relative">
                <pre className="rounded-lg p-4 text-xs text-slate-300 overflow-x-auto max-h-64 overflow-y-auto" style={{ background: '#0f1225', border: '1px solid #1e293b' }}>
                  {updatedConfig}
                </pre>
                <button
                  onClick={() => copyToClipboard(updatedConfig, 'config')}
                  className="absolute top-2 right-2 p-1.5 rounded-md transition-colors"
                  style={{ background: '#252b44' }}
                >
                  {copiedConfig ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
                </button>
              </div>

              <div className="mt-4 space-y-2 text-xs text-slate-400">
                <p>1. Vaya a Vercel Dashboard → Settings → Environment Variables</p>
                <p>2. Busque o cree la variable <code style={{ color: '#f59e0b' }}>AUTH_USERS</code></p>
                <p>3. Pegue el JSON anterior como valor</p>
                <p>4. Redeploy la aplicación para que tome efecto</p>
              </div>
            </div>

            <button
              onClick={() => router.push('/')}
              className="w-full py-2.5 text-white font-semibold rounded-lg shadow-lg transition-all"
              style={{ background: '#f59e0b' }}
            >
              Volver al Dashboard
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Step 1: Generate */}
            <div className="rounded-2xl p-8" style={{ background: '#252b44' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b' }}>
                  1
                </div>
                <h2 className="text-lg font-semibold text-white">Generar Código QR</h2>
              </div>

              <p className="text-sm text-slate-400 mb-6">
                Genere un código QR para escanear con su aplicación autenticadora 
                (Google Authenticator, Authy, Microsoft Authenticator, etc.)
              </p>

              {!qrCodeDataUrl ? (
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="w-full py-3 text-white font-semibold rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  style={{ background: generating ? '#92400e' : '#f59e0b' }}
                >
                  {generating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Generando...</span>
                    </>
                  ) : (
                    <>
                      <QrCode className="w-5 h-5" />
                      <span>Generar Código QR</span>
                    </>
                  )}
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <div className="bg-white p-4 rounded-xl">
                      <img src={qrCodeDataUrl} alt="QR Code MFA" className="w-48 h-48" />
                    </div>
                  </div>

                  <div className="rounded-lg p-4" style={{ background: '#1a1f36', border: '1px solid #374151' }}>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-slate-400">Clave Secreta (manual)</label>
                      <button
                        onClick={() => copyToClipboard(secret, 'secret')}
                        className="flex items-center gap-1 text-xs transition-colors"
                        style={{ color: '#f59e0b' }}
                      >
                        {copiedSecret ? (
                          <><CheckCircle2 className="w-3.5 h-3.5" /><span>Copiado</span></>
                        ) : (
                          <><Copy className="w-3.5 h-3.5" /><span>Copiar</span></>
                        )}
                      </button>
                    </div>
                    <code className="text-sm font-mono break-all" style={{ color: '#f59e0b' }}>{secret}</code>
                  </div>

                  <div className="text-xs text-slate-500 space-y-1">
                    <p>• Escanee el QR con su app autenticadora</p>
                    <p>• Si no puede escanear, ingrese la clave manualmente</p>
                    <p>• Luego ingrese el código de 6 dígitos a continuación</p>
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Verify */}
            {qrCodeDataUrl && (
              <div className="rounded-2xl p-8" style={{ background: '#252b44' }}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b' }}>
                    2
                  </div>
                  <h2 className="text-lg font-semibold text-white">Verificar y Activar</h2>
                </div>

                <p className="text-sm text-slate-400 mb-6">
                  Ingrese el código de 6 dígitos que muestra su aplicación autenticadora para completar la configuración
                </p>

                <div className="space-y-4">
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={verifyCode}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9\s]/g, '').slice(0, 7);
                        setVerifyCode(val);
                      }}
                      className="w-full pl-10 pr-4 py-3 rounded-lg text-white text-center text-xl tracking-[0.5em] font-mono placeholder-slate-500 focus:outline-none focus:ring-2 transition-all"
                      style={{ background: '#1a1f36', border: '1px solid #374151' }}
                      placeholder="000000"
                      autoFocus
                      inputMode="numeric"
                    />
                  </div>

                  <button
                    onClick={handleVerifyAndActivate}
                    disabled={verifying || verifyCode.replace(/\s/g, '').length < 6}
                    className="w-full py-3 text-white font-semibold rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    style={{ background: verifying ? '#92400e' : '#f59e0b' }}
                  >
                    {verifying ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Verificando...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        <span>Verificar y Activar MFA</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Info box */}
            <div className="rounded-xl p-5" style={{ background: '#252b44', border: '1px solid #374151' }}>
              <h3 className="text-sm font-medium text-slate-300 mb-3">¿Qué es MFA/TOTP?</h3>
              <div className="text-xs text-slate-400 space-y-2">
                <p>
                  La autenticación multifactor (MFA) agrega una capa adicional de seguridad a su cuenta. 
                  Además de su correo y contraseña, necesitará un código de 6 dígitos que cambia cada 30 segundos.
                </p>
                <p>
                  TOTP (Time-based One-Time Password) es el estándar utilizado por Google Authenticator, 
                  Authy, Microsoft Authenticator y otras aplicaciones similares.
                </p>
                <p>
                  Incluso si alguien obtiene su contraseña, no podrá acceder sin el código de su aplicación autenticadora.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
