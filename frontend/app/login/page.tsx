'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authApi } from '@/lib/api'
import { useSession } from '@/lib/store'

export default function LoginPage() {
  const router = useRouter()
  const { setSession } = useSession()
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handle = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      let data: any
      if (tab === 'login') {
        data = await authApi.login({ email: form.email, password: form.password })
      } else {
        data = await authApi.register({ name: form.name, email: form.email, password: form.password })
      }
      setSession({ userId: data.userId, walletId: data.walletId, userName: data.name })
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Erro ao autenticar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-text-primary">💼 Carteira</h1>
          <p className="text-text-secondary mt-1">Gerencie seus investimentos</p>
        </div>

        <div className="bg-bg-secondary border border-border rounded-xl p-8">
          <div className="flex gap-2 mb-6">
            {(['login', 'register'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === t
                    ? 'bg-accent text-white'
                    : 'bg-bg-primary text-text-secondary hover:text-text-primary'
                }`}
              >
                {t === 'login' ? 'Entrar' : 'Cadastrar'}
              </button>
            ))}
          </div>

          <form onSubmit={handle} className="space-y-4">
            {tab === 'register' && (
              <div>
                <label className="block text-sm text-text-secondary mb-1">Nome</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-accent"
                  placeholder="Seu nome"
                />
              </div>
            )}
            <div>
              <label className="block text-sm text-text-secondary mb-1">E-mail</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-accent"
                placeholder="seu@email.com"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Senha</label>
              <input
                type="password"
                required
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-accent"
                placeholder="••••••"
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent hover:bg-blue-600 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Aguarde...' : tab === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
