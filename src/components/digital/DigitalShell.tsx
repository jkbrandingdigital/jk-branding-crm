import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { ownHome } from '../../lib/permissions'
import Header from '../Header'
import DesignLayout from '../DesignLayout'
import SalesLayout from '../SalesLayout'
import AdminLayout from '../AdminLayout'
import HrLayout from '../HrLayout'
import DigitalLayout from '../DigitalLayout'

/*
  Digital is a switch, not a role, so its page sits inside whatever layout
  the person already works in — a designer keeps the design sidebar, a
  sales person the sales one. Roles whose layout has no Digital line yet
  get a plain page with the header and a way back.
*/
export default function DigitalShell({ children }: { children: ReactNode }) {
  const { role } = useAuth()
  if (role === 'super_admin') return <AdminLayout>{children}</AdminLayout>
  if (role === 'hr') return <HrLayout>{children}</HrLayout>
  if (role === 'digital') return <DigitalLayout>{children}</DigitalLayout>
  if (role === 'design_team') return <DesignLayout>{children}</DesignLayout>
  if (role === 'sales') return <SalesLayout active="digital">{children}</SalesLayout>
  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <main className="px-4 py-5 sm:px-6">
        <Link to={ownHome(role)} className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white">
          <ArrowLeft size={15} /> Back
        </Link>
        {children}
      </main>
    </div>
  )
}