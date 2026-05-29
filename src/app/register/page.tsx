'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Mail, Lock, User, Eye, EyeOff, AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  // Password strength indicator
  const getPasswordStrength = () => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    return strength;
  };

  const strengthLabels = ['', 'Muy débil', 'Débil', 'Regular', 'Fuerte', 'Muy fuerte'];
  const strengthColors = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    if (getPasswordStrength() < 3) {
      setError('La contraseña es muy débil. Use al menos 8 caracteres con mayúsculas y números.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, displayName, password, confirmPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error al registrarse');
        setLoading(false);
        return;
      }

      // Registration successful — redirect to MFA enrollment
      router.push('/enroll-mfa');
    } catch (err: any) {
      setError('Error de conexión. Intente nuevamente.');
      setLoading(false);
    }
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

      {/* Registration Card */}
      <div className="w-full max-w-md rounded-2xl p-8 shadow-2xl" style={{ background: '#252b44' }}>
        {error && (
          <div className="mb-5 flex items-center gap-2 p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-1">Registrarse</h2>
          <p className="text-slate-400 text-sm">Cree su cuenta para acceder al sistema de inteligencia</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          {/* Display Name */}
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">
              Nombre Completo
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all"
                style={{ background: '#1a1f36', border: '1px solid #374151' }}
                placeholder="Juan Pérez"
                required
                autoFocus
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">
              Correo Electrónico
            </label>
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
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-12 py-2.5 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all"
                style={{ background: '#1a1f36', border: '1px solid #374151' }}
                placeholder="Mínimo 8 caracteres"
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {/* Password strength */}
            {password && (
              <div className="mt-2">
                <div className="flex gap-1 mb-1">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div
                      key={i}
                      className="h-1 flex-1 rounded-full transition-all"
                      style={{
                        background: i <= getPasswordStrength() ? strengthColors[getPasswordStrength()] : '#374151'
                      }}
                    />
                  ))}
                </div>
                <p className="text-xs" style={{ color: strengthColors[getPasswordStrength()] }}>
                  {strengthLabels[getPasswordStrength()]}
                </p>
              </div>
            )}
            {/* Password requirements */}
            <div className="mt-2 grid grid-cols-2 gap-1">
              {[
                { label: '8+ caracteres', met: password.length >= 8 },
                { label: 'Una mayúscula', met: /[A-Z]/.test(password) },
                { label: 'Un número', met: /[0-9]/.test(password) },
                { label: 'Especial (!@#)', met: /[^A-Za-z0-9]/.test(password) },
              ].map(req => (
                <div key={req.label} className="flex items-center gap-1 text-xs" style={{ color: req.met ? '#22c55e' : '#64748b' }}>
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{req.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">
              Confirmar Contraseña
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-10 pr-12 py-2.5 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all"
                style={{
                  background: '#1a1f36',
                  border: confirmPassword && confirmPassword !== password ? '1px solid #ef4444' : '1px solid #374151'
                }}
                placeholder="Repita su contraseña"
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {confirmPassword && confirmPassword !== password && (
              <p className="text-xs text-red-400 mt-1">Las contraseñas no coinciden</p>
            )}
          </div>

          {/* Register button */}
          <button
            type="submit"
            disabled={loading || !email || !displayName || !password || !confirmPassword || password !== confirmPassword}
            className="w-full py-2.5 text-white font-semibold rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: loading ? '#92400e' : '#f59e0b' }}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Registrando...</span>
              </>
            ) : (
              <>
                <Shield className="w-4 h-4" />
                <span>Crear Cuenta</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="text-center pt-4">
          <span className="text-slate-500 text-sm">¿Ya tiene una cuenta? </span>
          <button
            onClick={() => router.push('/login')}
            className="text-sm font-medium transition-colors"
            style={{ color: '#f59e0b' }}
          >
            Iniciar Sesión
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-xs text-slate-600">
          Al registrarse, deberá configurar autenticación de doble factor (MFA)
        </p>
        <p className="text-xs text-slate-700 mt-1">
          Sistema de Inteligencia OSINT — Acceso Restringido
        </p>
      </div>
    </div>
  );
}
