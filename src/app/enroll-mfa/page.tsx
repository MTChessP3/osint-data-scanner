'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, QrCode, Copy, CheckCircle2, AlertTriangle, KeyRound, Lock } from 'lucide-react';
import { ThemeSelector } from '@/components/theme-selector';

export default function EnrollMfaPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<'loading' | 'generate' | 'verify' | 'success'>('loading');
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // MFA state
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [mfaDigits, setMfaDigits] = useState<string[]>(Array(6).fill(''));
  const [copiedSecret, setCopiedSecret] = useState(false);
  const mfaInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Check enrollment token
  useEffect(() => {
    fetch('/api/auth/session')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated && data.user?.mfaEnrolled) {
          // Already fully authenticated
          router.push('/');
        } else {
          // Has enrollment/mfa token — proceed to enrollment
          setPhase('generate');
        }
      })
      .catch(() => {
        router.push('/login');
      });
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
        setGenerating(false);
        return;
      }
      setQrCodeDataUrl(data.qrCodeDataUrl);
      setSecret(data.secret);
      setPhase('verify');
      setTimeout(() => mfaInputRefs.current[0]?.focus(), 200);
    } catch (err: any) {
      setError('Error de conexión');
    } finally {
      setGenerating(false);
    }
  };

  const handleVerifyAndEnroll = async (code?: string) => {
    const verifyCode = code || mfaDigits.join('');
    if (verifyCode.length < 6) return;

    setVerifying(true);
    setError('');
    try {
      const res = await fetch('/api/auth/mfa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify-and-enroll', code: verifyCode, secret }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Código inválido');
        setMfaDigits(Array(6).fill(''));
        setVerifying(false);
        setTimeout(() => mfaInputRefs.current[0]?.focus(), 100);
        return;
      }
      setPhase('success');
      // Redirect to dashboard after brief success display
      setTimeout(() => router.push('/'), 2000);
    } catch (err: any) {
      setError('Error de conexión');
      setVerifying(false);
    }
  };

  const handleMfaDigitChange = useCallback((index: number, value: string) => {
    const digit = value.replace(/[^0-9]/g, '').slice(-1);
    const newDigits = [...mfaDigits];
    newDigits[index] = digit;
    setMfaDigits(newDigits);

    if (digit && index < 5) {
      mfaInputRefs.current[index + 1]?.focus();
    }

    if (digit && index === 5) {
      const code = newDigits.join('');
      if (code.length === 6) {
        setTimeout(() => handleVerifyAndEnroll(code), 150);
      }
    }
  }, [mfaDigits, secret]);

  const handleMfaKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !mfaDigits[index] && index > 0) {
      mfaInputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'Enter') {
      handleVerifyAndEnroll();
    }
  };

  const handleMfaPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const newDigits = [...Array(6).fill('')];
      for (let i = 0; i < pasted.length; i++) {
        newDigits[i] = pasted[i];
      }
      setMfaDigits(newDigits);
      const focusIdx = Math.min(pasted.length, 5);
      mfaInputRefs.current[focusIdx]?.focus();
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
  };

  if (phase === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-bg">
        <div className="w-8 h-8 border-2 rounded-full animate-spin border-amber-500/30 border-t-amber-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-app-bg">
      {/* Theme Selector */}
      <div className="fixed top-4 right-4 z-50"><ThemeSelector /></div>

      {/* Logo */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl mb-3 bg-amber-500">
          <Lock className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-app-text tracking-tight">Enrolamiento MFA</h1>
        <p className="text-app-text-muted text-sm mt-1">Configuración obligatoria de autenticación de doble factor</p>
      </div>

      <div className="w-full max-w-md rounded-2xl p-8 shadow-2xl bg-app-surface">
        {error && (
          <div className="mb-5 flex items-center gap-2 p-3 rounded-lg text-sm bg-red-500/10 border border-red-500/20 text-red-400">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* SUCCESS PHASE */}
        {phase === 'success' && (
          <div className="text-center py-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 bg-green-500/10 border-2 border-green-500/30">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-app-text mb-2">MFA Configurado</h2>
            <p className="text-app-text-muted text-sm">Autenticación de doble factor activada. Redirigiendo al dashboard...</p>
          </div>
        )}

        {/* GENERATE PHASE */}
        {phase === 'generate' && (
          <div className="text-center">
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-3 bg-amber-500/10 border border-amber-500/30">
                <KeyRound className="w-6 h-6 text-amber-500" />
              </div>
              <h2 className="text-xl font-bold text-app-text mb-2">Paso 1: Generar Código QR</h2>
              <p className="text-app-text-muted text-sm">
                Para proteger su cuenta, debe configurar la autenticación de doble factor. 
                Esto es obligatorio para acceder al sistema.
              </p>
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating}
              className={`w-full py-3 text-white font-semibold rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 ${generating ? 'bg-amber-900' : 'bg-amber-500'}`}
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
          </div>
        )}

        {/* VERIFY PHASE */}
        {phase === 'verify' && (
          <div className="space-y-5">
            {/* QR Code */}
            <div>
              <h3 className="text-lg font-bold text-app-text mb-2">Paso 2: Escanear y Verificar</h3>
              <p className="text-app-text-muted text-sm mb-4">
                Escanee el código QR con su aplicación autenticadora y luego ingrese el código de 6 dígitos
              </p>

              <div className="flex justify-center mb-4">
                <div className="bg-white p-3 rounded-xl">
                  <img src={qrCodeDataUrl} alt="QR Code MFA" className="w-44 h-44" />
                </div>
              </div>

              {/* Secret key */}
              <div className="rounded-lg p-3 mb-4 bg-app-bg border border-app-border">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-app-text-muted">Clave Secreta (ingreso manual)</label>
                  <button
                    onClick={() => copyToClipboard(secret)}
                    className="flex items-center gap-1 text-xs text-amber-500 transition-colors"
                  >
                    {copiedSecret ? <><CheckCircle2 className="w-3 h-3" /><span>Copiado</span></> : <><Copy className="w-3 h-3" /><span>Copiar</span></>}
                  </button>
                </div>
                <code className="text-xs font-mono break-all text-amber-500">{secret}</code>
              </div>
            </div>

            {/* 6-digit input */}
            <div>
              <label className="block text-sm text-app-text-dim mb-3">Código de 6 dígitos</label>
              <div className="flex gap-2 justify-center" onPaste={handleMfaPaste}>
                {mfaDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => { mfaInputRefs.current[idx] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleMfaDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleMfaKeyDown(idx, e)}
                    className={`w-11 h-13 text-center text-lg font-bold rounded-lg focus:outline-none focus:ring-2 transition-all bg-app-bg border ${digit ? 'border-amber-500 text-amber-500' : 'border-app-border text-amber-500'}`}
                  />
                ))}
              </div>
            </div>

            <button
              onClick={() => handleVerifyAndEnroll()}
              disabled={verifying || mfaDigits.join('').length < 6}
              className={`w-full py-2.5 text-white font-semibold rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 ${verifying ? 'bg-amber-900' : 'bg-amber-500'}`}
            >
              {verifying ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verificando...</span>
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  <span>Verificar y Activar MFA</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-6 text-center">
        <p className="text-xs text-app-text-faint">
          La autenticación de doble factor es obligatoria para proteger su cuenta
        </p>
      </div>
    </div>
  );
}
