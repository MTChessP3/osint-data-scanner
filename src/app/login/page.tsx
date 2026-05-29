'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Lock, User, KeyRound, Fingerprint, Eye, EyeOff, AlertTriangle, CheckCircle2, ArrowRight, ArrowLeft } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'credentials' | 'mfa'>('credentials');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);

  // Check if already authenticated
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
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error al iniciar sesión');
        setLoading(false);
        return;
      }

      if (data.requiresMfa) {
        setMfaRequired(true);
        setStep('mfa');
        setLoading(false);
      } else {
        // No MFA required, redirect to main app
        router.push('/');
      }
    } catch (err: any) {
      setError('Error de conexión. Intente nuevamente.');
      setLoading(false);
    }
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: mfaCode.replace(/\s/g, '') }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Código MFA inválido');
        setMfaCode('');
        setLoading(false);
        return;
      }

      // MFA verified, redirect to main app
      router.push('/');
    } catch (err: any) {
      setError('Error de conexión. Intente nuevamente.');
      setLoading(false);
    }
  };

  const handleBackToCredentials = () => {
    setStep('credentials');
    setMfaCode('');
    setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)`,
          backgroundSize: '40px 40px'
        }} />
      </div>

      {/* Decorative elements */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />

      <div className="relative w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-cyan-500 to-emerald-600 rounded-2xl shadow-2xl shadow-cyan-500/20 mb-4">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">OSINT DataScanner</h1>
          <p className="text-slate-400 text-sm">Sistema de Inteligencia de Fuentes Abiertas</p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden">
          {/* Step indicator */}
          <div className="flex border-b border-slate-700/50">
            <div className={`flex-1 py-3 text-center text-xs font-medium transition-colors ${
              step === 'credentials'
                ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/5'
                : mfaRequired
                  ? 'text-emerald-400 bg-emerald-500/5'
                  : 'text-slate-500'
            }`}>
              <div className="flex items-center justify-center gap-1.5">
                {mfaRequired ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <User className="w-3.5 h-3.5" />
                )}
                <span>1. Credenciales</span>
              </div>
            </div>
            <div className={`flex-1 py-3 text-center text-xs font-medium transition-colors ${
              step === 'mfa'
                ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/5'
                : 'text-slate-500'
            }`}>
              <div className="flex items-center justify-center gap-1.5">
                <Fingerprint className="w-3.5 h-3.5" />
                <span>2. Autenticación MFA</span>
              </div>
            </div>
          </div>

          <div className="p-8">
            {/* Error message */}
            {error && (
              <div className="mb-6 flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Step 1: Credentials */}
            {step === 'credentials' && (
              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Usuario
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
                      placeholder="Ingrese su usuario"
                      required
                      autoFocus
                      autoComplete="username"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Contraseña
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-12 py-2.5 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
                      placeholder="Ingrese su contraseña"
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !username || !password}
                  className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-emerald-600 hover:from-cyan-400 hover:to-emerald-500 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Verificando...</span>
                    </>
                  ) : (
                    <>
                      <span>Iniciar Sesión</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Step 2: MFA Verification */}
            {step === 'mfa' && (
              <form onSubmit={handleMfaVerify} className="space-y-5">
                <div className="text-center mb-2">
                  <div className="inline-flex items-center justify-center w-14 h-14 bg-cyan-500/10 border border-cyan-500/20 rounded-full mb-3">
                    <Fingerprint className="w-7 h-7 text-cyan-400" />
                  </div>
                  <p className="text-slate-300 text-sm">
                    Ingrese el código de 6 dígitos de su aplicación autenticadora
                  </p>
                  <p className="text-slate-500 text-xs mt-1">
                    Google Authenticator, Authy, Microsoft Authenticator, etc.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Código MFA
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      value={mfaCode}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9\s]/g, '').slice(0, 7);
                        setMfaCode(val);
                      }}
                      className="w-full pl-10 pr-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white text-center text-xl tracking-[0.5em] font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
                      placeholder="000000"
                      required
                      autoFocus
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      pattern="[0-9\s]*"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleBackToCredentials}
                    className="flex-1 py-2.5 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 font-medium rounded-lg transition-all flex items-center justify-center gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Volver</span>
                  </button>
                  <button
                    type="submit"
                    disabled={loading || mfaCode.replace(/\s/g, '').length < 6}
                    className="flex-[2] py-2.5 bg-gradient-to-r from-cyan-500 to-emerald-600 hover:from-cyan-400 hover:to-emerald-500 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 transition-all flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Verificando...</span>
                      </>
                    ) : (
                      <>
                        <span>Verificar</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Footer */}
          <div className="px-8 py-4 bg-slate-900/30 border-t border-slate-700/30">
            <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
              <Lock className="w-3 h-3" />
              <span>Conexión segura · Autenticación protegida con MFA</span>
            </div>
          </div>
        </div>

        {/* Security notice */}
        <div className="mt-6 text-center">
          <p className="text-xs text-slate-600">
            Sistema de acceso restringido · Solo personal autorizado
          </p>
          <p className="text-xs text-slate-700 mt-1">
            El acceso no autorizado es violatorio y será reportado
          </p>
        </div>
      </div>
    </div>
  );
}
