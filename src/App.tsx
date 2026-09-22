import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import AdminDashboard from './pages/admin/Dashboard'
import AdminSalesPerformance from './pages/admin/SalesPerformance'
import AdminSalesTargets from './pages/admin/SalesTargets'
import AdminReports from './pages/admin/Reports'
import AdminEvolution from './pages/admin/Evolution'
import AdminEmployees from './pages/admin/Employees'
import AdminEvolutionQuestions from './pages/admin/EvolutionQuestions'
import AdminEmployeeReport from './pages/admin/EmployeeReport'
import SalesDashboard from './pages/sales/Dashboard'
import HRDashboard from './pages/hr/Dashboard'
import ManagerDashboard from './pages/manager/Dashboard'
import ManagerPerformance from './pages/manager/Performance'
import ManagerTargets from './pages/manager/Targets'
import ManagerReports from './pages/manager/Reports'
import ManagerEmployeeReport from './pages/manager/EmployeeReport'

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
          <Route path="/admin/reports" element={<AdminReports />} />
          <Route path="/admin/evolution" element={<AdminEvolution />} />
          <Route path="/admin/employees" element={<AdminEmployees />} />
          <Route path="/admin/questions" element={<AdminEvolutionQuestions />} />
          <Route path="/admin/employee/:id" element={<AdminEmployeeReport />} />
          <Route path="/admin/*" element={<AdminDashboard />} />
        </>
      )}
      {role === 'branch_manager' && (
        <>
          <Route path="/manager/performance" element={<ManagerPerformance />} />
          <Route path="/manager/targets" element={<ManagerTargets />} />
          <Route path="/manager/reports" element={<ManagerReports />} />
          <Route path="/manager/employee/:id" element={<ManagerEmployeeReport />} />
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