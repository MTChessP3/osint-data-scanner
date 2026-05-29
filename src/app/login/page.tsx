'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Lock, Mail, Eye, EyeOff, AlertTriangle, ArrowRight, KeyRound } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'credentials' | 'mfa'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaDigits, setMfaDigits] = useState<string[]>(Array(6).fill(''));
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const mfaInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    fetch('/api/auth/session')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          router.push('/');
        }
      })
      .catch(() => {});
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error al iniciar sesión');
        setLoading(false);
        return;
      }

      if (data.requiresMfa) {
        setStep('mfa');
        setLoading(false);
        setTimeout(() => mfaInputRefs.current[0]?.focus(), 100);
      } else if (data.requiresMfaEnrollment) {
        // User needs to enroll in MFA
        router.push('/enroll-mfa');
      } else {
        router.push('/');
      }
    } catch (err: any) {
      setError('Error de conexión. Intente nuevamente.');
      setLoading(false);
    }
  };

  const handleMfaVerify = async (code?: string) => {
    const verifyCode = code || mfaDigits.join('');
    if (verifyCode.length < 6) return;

    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verifyCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Código MFA inválido');
        setMfaDigits(Array(6).fill(''));
        setLoading(false);
        setTimeout(() => mfaInputRefs.current[0]?.focus(), 100);
        return;
      }

      router.push('/');
    } catch (err: any) {
      setError('Error de conexión. Intente nuevamente.');
      setLoading(false);
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
        setTimeout(() => {
          const currentCode = newDigits.join('');
          if (currentCode.length === 6) {
            handleMfaVerifyAuto(currentCode);
          }
        }, 150);
      }
    }
  }, [mfaDigits]);

  const handleMfaVerifyAuto = async (code: string) => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Código MFA inválido');
        setMfaDigits(Array(6).fill(''));
        setLoading(false);
        setTimeout(() => mfaInputRefs.current[0]?.focus(), 100);
        return;
      }
      router.push('/');
    } catch {
      setError('Error de conexión. Intente nuevamente.');
      setLoading(false);
    }
  };

  const handleMfaKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !mfaDigits[index] && index > 0) {
      mfaInputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'Enter') {
      handleMfaVerify();
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

  const handleBackToCredentials = () => {
    setStep('credentials');
    setMfaDigits(Array(6).fill(''));
    setError('');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: '#1a1f36' }}>
      {/* Logo */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl mb-4" style={{ background: '#f59e0b' }}>
          <Shield className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">OSINT Data Scanner</h1>
        <p className="text-slate-400 text-sm mt-1">Sistema de Inteligencia de Fuentes Abiertas</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md rounded-2xl p-8 shadow-2xl" style={{ background: '#252b44' }}>
        {error && (
          <div className="mb-5 flex items-center gap-2 p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: Credentials */}
        {step === 'credentials' && (
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-1">Iniciar Sesión</h2>
              <p className="text-slate-400 text-sm">Acceda al sistema de inteligencia OSINT</p>
            </div>

            <div>
              <label className="block text-sm text-slate-300 mb-1.5">Correo Electrónico</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all"
                  style={{ background: '#1a1f36', border: '1px solid #374151' }}
                  placeholder="correo@ejemplo.com"
                  required
                  autoFocus
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-300 mb-1.5">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-2.5 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all"
                  style={{ background: showPassword ? '#f8fafc' : '#1a1f36', border: '1px solid #374151', color: showPassword ? '#1a1f36' : 'white' }}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: showPassword ? '#64748b' : '#94a3b8' }}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full py-2.5 text-white font-semibold rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: loading ? '#92400e' : '#f59e0b' }}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verificando...</span>
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  <span>Iniciar Sesión</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="text-center pt-2">
              <span className="text-slate-500 text-sm">¿No tiene una cuenta? </span>
              <button
                type="button"
                onClick={() => router.push('/register')}
                className="text-sm font-medium transition-colors"
                style={{ color: '#f59e0b' }}
              >
                Registrarse
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: MFA Code */}
        {step === 'mfa' && (
          <form onSubmit={(e) => { e.preventDefault(); handleMfaVerify(); }} className="space-y-5">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-1">Autenticación de Doble Factor</h2>
              <p className="text-slate-400 text-sm">Ingrese el código de su aplicación autenticadora</p>
            </div>

            <div>
              <label className="block text-sm text-slate-300 mb-3">Código de 6 dígitos</label>
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
                    className="w-12 h-14 text-center text-xl font-bold rounded-lg focus:outline-none focus:ring-2 transition-all"
                    style={{
                      background: '#1a1f36',
                      border: digit ? '1px solid #f59e0b' : '1px solid #374151',
                      color: '#f59e0b',
                    }}
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || mfaDigits.join('').length < 6}
              className="w-full py-2.5 text-white font-semibold rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: loading ? '#92400e' : '#f59e0b' }}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verificando...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>Verificar Código</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleBackToCredentials}
              className="w-full py-2 text-slate-400 hover:text-white flex items-center justify-center gap-1.5 text-sm transition-colors"
            >
              <span>← Volver al inicio de sesión</span>
            </button>
          </form>
        )}
      </div>

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-xs text-slate-600">
          Sistema de Inteligencia OSINT — Acceso Restringido
        </p>
      </div>
    </div>
  );
}
