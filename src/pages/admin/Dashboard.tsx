import { signOut } from '../../lib/auth'
import { LogOut, Building2 } from 'lucide-react'
import Header from '../../components/Header'

export default function AdminDashboard() {
  async function handleLogout() {
    await signOut()
    window.location.href = '/'
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
     <Header />
      {/* Content */}
      <div className="p-8">
        <h1 className="text-2xl font-bold text-orange-500">Admin Dashboard</h1>
        <p className="text-gray-400 mt-2">Welcome, Super Admin!</p>
      </div>
    </div>
  )
}