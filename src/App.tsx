import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import AdminDashboard from './pages/admin/Dashboard'
import AdminSalesPerformance from './pages/admin/SalesPerformance'
import AdminSalesTargets from './pages/admin/SalesTargets'
import SalesDashboard from './pages/sales/Dashboard'
import HRDashboard from './pages/hr/Dashboard'
import ManagerDashboard from './pages/manager/Dashboard'
import ManagerPerformance from './pages/manager/Performance'

function AppRoutes() {
  const { user, role, loading } = useAuth()

  if (loading) return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
      <div className="text-orange-500 text-xl">Loading...</div>
    </div>
  )

  if (!user) return <LoginPage />

  const home =
    role === 'super_admin' ? '/admin' :
    role === 'hr' ? '/hr' :
    role === 'branch_manager' ? '/manager' :
    '/sales'

  return (
    <Routes>
      {role === 'super_admin' && (
        <>
          <Route path="/admin/performance" element={<AdminSalesPerformance />} />
          <Route path="/admin/targets" element={<AdminSalesTargets />} />
          <Route path="/admin/*" element={<AdminDashboard />} />
        </>
      )}
      {role === 'branch_manager' && (
        <>
          <Route path="/manager/performance" element={<ManagerPerformance />} />
          <Route path="/manager/*" element={<ManagerDashboard />} />
        </>
      )}
      {role === 'sales' && (
        <Route path="/sales/*" element={<SalesDashboard />} />
      )}
      {role === 'hr' && (
        <Route path="/hr/*" element={<HRDashboard />} />
      )}
      <Route path="*" element={<Navigate to={home} />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}