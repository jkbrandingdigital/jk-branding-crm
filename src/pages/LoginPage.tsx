import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { signIn } from '../lib/auth'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await signIn(email, password)
    } catch (err: any) {
      setError('Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="bg-orange-500 p-4 rounded-2xl mb-4">
            <Building2 className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-white text-3xl font-bold">JK Branding CRM</h1>
          <p className="text-gray-400 mt-2">Sign in to continue to your dashboard</p>
        </div>

        {/* Form */}
        <div className="bg-[#1a1a1a] rounded-2xl p-8 border border-[#2a2a2a]">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg mb-6 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="text-gray-300 text-sm font-medium block mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@jkbranding.com"
                required
                className="w-full bg-[#0f0f0f] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-gray-300 text-sm font-medium block mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-[#0f0f0f] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="text-gray-500 text-center text-sm mt-6">
            Accounts are created by your administrator.
          </p>
        </div>
      </div>
    </div>
  )
}