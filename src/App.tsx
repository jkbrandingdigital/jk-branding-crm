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
import AdminLeads from './pages/admin/Leads'
import SalesDashboard from './pages/sales/Dashboard'
import HRDashboard from './pages/hr/Dashboard'
import ManagerDashboard from './pages/manager/Dashboard'
import ManagerPerformance from './pages/manager/Performance'
import ManagerTargets from './pages/manager/Targets'
import ManagerReports from './pages/manager/Reports'
import ManagerEmployeeReport from './pages/manager/EmployeeReport'
import ManagerLeads from './pages/manager/Leads'
import AdminLeadAssignment from './pages/admin/LeadAssignment'
import AdminSettings from './pages/admin/Settings'
import HrLeads from './pages/hr/Leads'
import HrEmployees from './pages/hr/Employees'
import AdminReminders from './pages/admin/Reminders'
import ManagerReminders from './pages/manager/Reminders'
import HrReminders from './pages/hr/Reminders'
import SalesReminders from './pages/sales/Reminders'
import DesignDashboard from './pages/design/Dashboard'
import DesignReminders from './pages/design/Reminders'
import AdminTasks from './pages/admin/Tasks'
import ManagerTasks from './pages/manager/Tasks'
import HrTasks from './pages/hr/Tasks'
import SalesTasks from './pages/sales/Tasks'
import DesignTasks from './pages/design/Tasks'
import AdminNotes from './pages/admin/Notes'
import ManagerNotes from './pages/manager/Notes'
import HrNotes from './pages/hr/Notes'
import SalesNotes from './pages/sales/Notes'
import DesignNotes from './pages/design/Notes'
import AdminQuotations from './pages/admin/Quotations'
import AdminQuotationEdit from './pages/admin/QuotationEdit'
import AdminQuotationView from './pages/admin/QuotationView'
import AdminQuotationSettings from './pages/admin/QuotationSettingsPage'
import ManagerQuotations from './pages/manager/Quotations'
import ManagerQuotationEdit from './pages/manager/QuotationEdit'
import ManagerQuotationView from './pages/manager/QuotationView'
import SalesQuotations from './pages/sales/Quotations'
import SalesQuotationEdit from './pages/sales/QuotationEdit'
import SalesQuotationView from './pages/sales/QuotationView'

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
    role === 'design_team' ? '/design' :
    '/sales'

  return (
    <Routes>
      {role === 'super_admin' && (
        <>
          <Route path="/admin/leads" element={<AdminLeads />} />
          <Route path="/admin/performance" element={<AdminSalesPerformance />} />
          <Route path="/admin/targets" element={<AdminSalesTargets />} />
          <Route path="/admin/reports" element={<AdminReports />} />
          <Route path="/admin/evolution" element={<AdminEvolution />} />
          <Route path="/admin/employees" element={<AdminEmployees />} />
          <Route path="/admin/questions" element={<AdminEvolutionQuestions />} />
          <Route path="/admin/employee/:id" element={<AdminEmployeeReport />} />
          <Route path="/admin/lead-assignment" element={<AdminLeadAssignment />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
          <Route path="/admin/reminders" element={<AdminReminders />} />
          <Route path="/admin/tasks" element={<AdminTasks />} />
          <Route path="/admin/notes" element={<AdminNotes />} />
          <Route path="/admin/quotations" element={<AdminQuotations />} />
          <Route path="/admin/quotations/settings" element={<AdminQuotationSettings />} />
          <Route path="/admin/quotations/new" element={<AdminQuotationEdit />} />
          <Route path="/admin/quotations/:id/preview" element={<AdminQuotationView />} />
          <Route path="/admin/quotations/:id" element={<AdminQuotationEdit />} />
          <Route path="/admin/*" element={<AdminDashboard />} />
          
        </>
      )}
      {role === 'branch_manager' && (
        <>
          <Route path="/manager/leads" element={<ManagerLeads />} />
          <Route path="/manager/performance" element={<ManagerPerformance />} />
          <Route path="/manager/targets" element={<ManagerTargets />} />
          <Route path="/manager/reports" element={<ManagerReports />} />
          <Route path="/manager/employee/:id" element={<ManagerEmployeeReport />} />
          <Route path="/manager/reminders" element={<ManagerReminders />} />
          <Route path="/manager/tasks" element={<ManagerTasks />} />
          <Route path="/manager/notes" element={<ManagerNotes />} />
          <Route path="/manager/quotations" element={<ManagerQuotations />} />
          <Route path="/manager/quotations/new" element={<ManagerQuotationEdit />} />
          <Route path="/manager/quotations/:id/preview" element={<ManagerQuotationView />} />
          <Route path="/manager/quotations/:id" element={<ManagerQuotationEdit />} />
          <Route path="/manager/*" element={<ManagerDashboard />} />
        </>
      )}
      {role === 'sales' && (
        <>
          <Route path="/sales/reminders" element={<SalesReminders />} />
          <Route path="/sales/tasks" element={<SalesTasks />} />
          <Route path="/sales/notes" element={<SalesNotes />} />
          <Route path="/sales/quotations" element={<SalesQuotations />} />
          <Route path="/sales/quotations/new" element={<SalesQuotationEdit />} />
          <Route path="/sales/quotations/:id/preview" element={<SalesQuotationView />} />
          <Route path="/sales/quotations/:id" element={<SalesQuotationEdit />} />
          <Route path="/sales/*" element={<SalesDashboard />} />
        </>
      )}
      {role === 'hr' && (
        <>
          <Route path="/hr/leads" element={<HrLeads />} />
          <Route path="/hr/employees" element={<HrEmployees />} />
          <Route path="/hr/reminders" element={<HrReminders />} />
          <Route path="/hr/tasks" element={<HrTasks />} />
          <Route path="/hr/notes" element={<HrNotes />} />
          <Route path="/hr/*" element={<HRDashboard />} />
        </>
      )}
      {role === 'design_team' && (
        <>
          <Route path="/design/reminders" element={<DesignReminders />} />
          <Route path="/design/tasks" element={<DesignTasks />} />
          <Route path="/design/notes" element={<DesignNotes />} />
          <Route path="/design/*" element={<DesignDashboard />} />
        </>
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