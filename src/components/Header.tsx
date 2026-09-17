import { signOut } from '../lib/auth'
import { LogOut } from 'lucide-react'

export default function Header() {
  async function handleLogout() {
    await signOut()
    window.location.href = '/'
  }

  return (
    <header className="bg-[#1a1a1a] border-b border-[#2a2a2a] px-6 py-4 flex justify-between items-center">
      
      <div className="flex items-center gap-0">
        <div className="bg-black-500 p-2 rounded-xl">
      <img src="/jklogoicon.png" alt="JK Icon" className="h-10 w-13"/></div>
        
        <div>
      <img src="/logo.png" alt="JK Branding" className="h-10 w-auto"/>
    <p className="text-orange-400 text-xs font-medium">Vision 2036 : Agency to Unicorn</p>
  </div>
      </div>
      <button
        onClick={handleLogout}
        className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors"
      >
        <LogOut className="w-4 h-4" />
        Logout
      </button>
    </header>
  )
}