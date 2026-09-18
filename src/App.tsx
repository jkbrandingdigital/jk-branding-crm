import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import AdminDashboard from './pages/admin/Dashboard'
import SalesDashboard from './pages/sales/Dashboard'
import HRDashboard from './pages/hr/Dashboard'
import AdminSalesPerformance from './pages/admin/SalesPerformance'
import AdminSalesTargets from './pages/admin/SalesTargets'

function AppRoutes() {
  const { user, role, loading } = useAuth()

  if (loading) return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
      <div className="text-orange-500 text-xl">JK BrandOS™...</div>
    </div>
  )

  if (!user) return <LoginPage />

  return (
    <Routes>
      {role === 'super_admin' && (
        <>
          <Route path="/admin/performance" element={<AdminSalesPerformance />} />
          <Route path="/admin/targets" element={<AdminSalesTargets />} />
          <Route path="/admin/*" element={<AdminDashboard />} />
        </>
      )}
      {role === 'sales' && (
        <Route path="/sales/*" element={<SalesDashboard />} />
      )}
      {role === 'hr' && (
        <Route path="/hr/*" element={<HRDashboard />} />
      )}
      <Route path="*" element={
        <Navigate to={
          role === 'super_admin' ? '/admin' :
          role === 'hr' ? '/hr' : '/sales'
        } />
      } />
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