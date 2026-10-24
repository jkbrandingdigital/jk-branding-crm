import { type ReactElement } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { usePermissions, ownHome } from './lib/permissions'
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
import AdminTaskSettings from './pages/admin/TaskSettingsPage'
import AdminBackup from './pages/admin/Backup'
import AdminTodos from './pages/admin/Todos'
import SalesTodos from './pages/sales/Todos'
import ManagerTodos from './pages/manager/Todos'
import HrTodos from './pages/hr/Todos'
import DesignTodos from './pages/design/Todos'
import AdminTeamActivity from './pages/admin/TeamActivity'
import ManagerTeamActivity from './pages/manager/TeamActivity'
import DesignTeamActivity from './pages/design/TeamActivity'
import DesignPerformancePage from './pages/design/Performance'
import AdminDesignPerformance from './pages/admin/DesignPerformance'
import HrDesignPerformance from './pages/hr/DesignPerformance'
import AdminWorkTypes from './pages/admin/WorkTypes'
import AdminPrintRegister from './pages/admin/PrintRegister'
import AdminCustomers from './pages/admin/Customers'
import GreetingsPopup from './components/customers/GreetingsPopup'
import AdminGreetings from './pages/admin/Greetings'
import ManagerGreetings from './pages/manager/Greetings'
import SalesGreetings from './pages/sales/Greetings'
import AdminProjects from './pages/admin/Projects'
import DesignProjects from './pages/design/Projects'
import ManagerProjects from './pages/manager/Projects'
import SalesProjects from './pages/sales/Projects'
import SalesCustomers from './pages/sales/Customers'
import ManagerCustomers from './pages/manager/Customers'
import DesignPrintRegister from './pages/design/PrintRegister'
import ManagerQuotations from './pages/manager/Quotations'
import ManagerQuotationEdit from './pages/manager/QuotationEdit'
import ManagerQuotationView from './pages/manager/QuotationView'
import SalesQuotations from './pages/sales/Quotations'
import SalesQuotationEdit from './pages/sales/QuotationEdit'
import SalesQuotationView from './pages/sales/QuotationView'
// Attendance: one scan page for everybody, and each role's own register.
import Scan from './pages/Scan'
import AdminScanSetup from './pages/admin/ScanSetup'
import HrScanSetup from './pages/hr/ScanSetup'
import AdminMyAttendance from './pages/admin/MyAttendance'
import HrAttendance from './pages/hr/Attendance'
import ManagerAttendance from './pages/manager/Attendance'
import SalesAttendance from './pages/sales/Attendance'
import DesignAttendance from './pages/design/Attendance'
import HrAttendanceAll from './pages/hr/AttendanceAll'
import AdminAttendanceAll from './pages/admin/AttendanceAll'
import HrMyLeavePage from './pages/hr/MyLeave'
import HrLeavesPage from './pages/hr/Leaves'
import HrSetupPage from './pages/hr/Setup'
import HrPayrollPage from './pages/hr/Payroll'
import AdminLeavesPage from './pages/admin/Leaves'
import AdminPayrollPage from './pages/admin/Payroll'
import AdminSetupPage from './pages/admin/Setup'
import AdminAssetsPage from './pages/admin/Assets'
import AdminEmployeePayrollPage from './pages/admin/EmployeePayroll'
import HrEmployeePayrollPage from './pages/hr/EmployeePayroll'
import HrAssetsPage from './pages/hr/Assets'
import HrMyPayslips from './pages/hr/MyPayslips'
import AdminMyPayslips from './pages/admin/MyPayslips'
import ManagerMyPayslips from './pages/manager/MyPayslips'
import SalesMyPayslips from './pages/sales/MyPayslips'
import DesignMyPayslips from './pages/design/MyPayslips'
// Company policy. Reading is open to everyone, so those five routes carry
// no Guard; writing is gated on policy_edit, and PolicyManager also
// checks for itself — the route decides what is reachable, the screen
// decides what is allowed.
import HrPolicies from './pages/hr/Policies'
import HrPoliciesManage from './pages/hr/PoliciesManage'
import AdminPolicies from './pages/admin/Policies'
import AdminPoliciesManage from './pages/admin/PoliciesManage'
import ManagerPolicies from './pages/manager/Policies'
import SalesPolicies from './pages/sales/Policies'
import DesignPolicies from './pages/design/Policies'
import AdminMyLeave from './pages/admin/MyLeave'
import ManagerMyLeave from './pages/manager/MyLeave'
import ManagerAttendancePage from './pages/manager/Attendance'
import SalesMyLeave from './pages/sales/MyLeave'
import DesignMyLeave from './pages/design/MyLeave'

// Where a sub admin lands, in order. The first one they are allowed to
// open becomes their home page.
const ADMIN_HOME: { perm: string; path: string }[] = [
  { perm: 'mod_leads', path: '/admin/leads' },
  { perm: 'mod_performance', path: '/admin/performance' },
  { perm: 'mod_reports', path: '/admin/reports' },
  { perm: 'mod_evolution', path: '/admin/evolution' },
  { perm: 'mod_targets', path: '/admin/targets' },
  { perm: 'mod_lead_assignment', path: '/admin/lead-assignment' },
  { perm: 'mod_questions', path: '/admin/questions' },
  { perm: 'mod_tasks', path: '/admin/tasks' },
  { perm: 'mod_reminders', path: '/admin/reminders' },
  { perm: 'mod_notes', path: '/admin/notes' },
  { perm: 'mod_todos', path: '/admin/todos' },
  { perm: 'mod_quotations', path: '/admin/quotations' },
  { perm: 'mod_employees', path: '/admin/employees' },
  { perm: 'mod_settings', path: '/admin/settings' },
  { perm: 'mod_backup', path: '/admin/backup' },
]

// One admin page. `ok` is worked out by the caller so this component
// keeps the same identity between renders and pages do not remount.
function Guard({ ok, children }: { ok: boolean; children: ReactElement }) {
  return ok ? children : <Navigate to="/admin" replace />
}

function NoAdminAccess() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f0f0f] px-6 text-center">
      <div>
        <p className="text-lg font-semibold text-white">Nothing is switched on yet</p>
        <p className="mt-2 text-sm text-gray-400">
          Ask the super admin to open Employees, find your name, and tick what you should be able to see.
        </p>
      </div>
    </div>
  )
}

function AppRoutes() {
  const { user, role, loading } = useAuth()
  const { can, ready: permsReady, isSubAdmin } = usePermissions()

  if (loading || !permsReady) return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
      <div className="text-orange-500 text-xl">Loading...</div>
    </div>
  )

  if (!user) return <LoginPage />

  const isSuper = role === 'super_admin'
  // A sub admin opens the admin area, but only the pages switched on
  // for them. Being a sub admin is not a master key.
  const adminArea = isSuper || isSubAdmin
  const subHome = ADMIN_HOME.find((x) => can(x.perm))?.path ?? null

  // Super admin opens everything; a sub admin only what is switched on
  const may = (perm: string) => isSuper || can(perm)

  // A sub admin is still a sales person (or manager, or HR) first. They
  // land on their own daily work and step into the admin area from the
  // button in the header.
  const home = ownHome(role)

  return (
    <>
      {/* Today's birthdays and anniversaries, wherever the person is.
          Put here rather than in each layout so there is one of it, and
          so it cannot be missed by opening a page that happens to use a
          different layout. */}
      <GreetingsPopup />
    <Routes>
      {/* Everybody scans, whatever their role, and this page has no
          sidebar — it is a thing you do at a gate in ten seconds. Above
          the role blocks because each of those ends in a catch-all
          (/hr/*, /admin/*) and the first match wins. */}
      <Route path="/scan" element={<Scan />} />

      {adminArea && (
        <>
          <Route path="/admin/leads" element={<Guard ok={may('mod_leads')}><AdminLeads /></Guard>} />
          <Route path="/admin/performance" element={<Guard ok={may('mod_performance')}><AdminSalesPerformance /></Guard>} />
          <Route path="/admin/targets" element={<Guard ok={may('mod_targets')}><AdminSalesTargets /></Guard>} />
          <Route path="/admin/reports" element={<Guard ok={may('mod_reports')}><AdminReports /></Guard>} />
          <Route path="/admin/evolution" element={<Guard ok={may('mod_evolution')}><AdminEvolution /></Guard>} />
          <Route path="/admin/employees" element={<Guard ok={may('mod_employees')}><AdminEmployees /></Guard>} />
          <Route path="/admin/scan-setup" element={<Guard ok={may('scan_setup')}><AdminScanSetup /></Guard>} />
          {/* Their own days — open to anyone who reached the admin area. */}
          <Route path="/admin/my-attendance" element={<AdminMyAttendance />} />
          <Route path="/admin/questions" element={<Guard ok={may('mod_questions')}><AdminEvolutionQuestions /></Guard>} />
          <Route path="/admin/employee/:id" element={<Guard ok={may('mod_performance')}><AdminEmployeeReport /></Guard>} />
          <Route path="/admin/lead-assignment" element={<Guard ok={may('mod_lead_assignment')}><AdminLeadAssignment /></Guard>} />
          <Route path="/admin/settings" element={<Guard ok={may('mod_settings')}><AdminSettings /></Guard>} />
          <Route path="/admin/backup" element={<Guard ok={may('mod_backup')}><AdminBackup /></Guard>} />
          <Route path="/admin/reminders" element={<Guard ok={may('mod_reminders')}><AdminReminders /></Guard>} />
          <Route path="/admin/tasks" element={<Guard ok={may('mod_tasks')}><AdminTasks /></Guard>} />
          <Route path="/admin/tasks/settings" element={<Guard ok={may('task_settings')}><AdminTaskSettings /></Guard>} />
          <Route path="/admin/notes" element={<Guard ok={may('mod_notes')}><AdminNotes /></Guard>} />
          <Route path="/admin/todos" element={<Guard ok={may('mod_todos')}><AdminTodos /></Guard>} />
          <Route path="/admin/activity" element={<Guard ok={may('timer_view_all')}><AdminTeamActivity /></Guard>} />
          <Route path="/admin/design-performance" element={<Guard ok={may('design_perf')}><AdminDesignPerformance /></Guard>} />
          <Route path="/admin/work-types" element={<Guard ok={may('work_types_edit')}><AdminWorkTypes /></Guard>} />
          <Route path="/admin/print" element={<Guard ok={may('mod_print_jobs')}><AdminPrintRegister /></Guard>} />
          <Route path="/admin/customers" element={<Guard ok={may('mod_customers')}><AdminCustomers /></Guard>} />
          <Route path="/admin/greetings" element={<Guard ok={may('mod_customers')}><AdminGreetings /></Guard>} />
          <Route path="/admin/projects" element={<Guard ok={may('mod_projects')}><AdminProjects /></Guard>} />
          <Route path="/admin/quotations" element={<Guard ok={may('mod_quotations')}><AdminQuotations /></Guard>} />
          <Route path="/admin/quotations/settings" element={<Guard ok={may('quote_settings')}><AdminQuotationSettings /></Guard>} />
          <Route path="/admin/quotations/new" element={<Guard ok={may('quote_create')}><AdminQuotationEdit /></Guard>} />
          <Route path="/admin/quotations/:id/preview" element={<Guard ok={may('mod_quotations')}><AdminQuotationView /></Guard>} />
          <Route path="/admin/quotations/:id" element={<Guard ok={may('quote_edit')}><AdminQuotationEdit /></Guard>} />
          <Route path="/admin/attendance" element={<Guard ok={may('attendance_view_all')}><AdminAttendanceAll /></Guard>} />
          <Route path="/admin/my-leave" element={<AdminMyLeave />} />
          <Route path="/admin/my-payslips" element={<AdminMyPayslips />} />
          <Route path="/admin/leaves" element={<Guard ok={may('leave_approve')}><AdminLeavesPage /></Guard>} />
          <Route path="/admin/payroll" element={<Guard ok={may('mod_payroll')}><AdminPayrollPage /></Guard>} />
          <Route path="/admin/payroll/:id" element={<Guard ok={may('mod_payroll')}><AdminEmployeePayrollPage /></Guard>} />
          <Route path="/admin/setup" element={<Guard ok={may('attendance_edit')}><AdminSetupPage /></Guard>} />
          <Route path="/admin/assets" element={<Guard ok={may('mod_assets')}><AdminAssetsPage /></Guard>} />
          <Route path="/admin/policies" element={<AdminPolicies />} />
          <Route path="/admin/policies-manage" element={<Guard ok={may('policy_edit')}><AdminPoliciesManage /></Guard>} />
          <Route
            path="/admin/*"
            element={isSuper ? <AdminDashboard /> : subHome ? <Navigate to={subHome} replace /> : <NoAdminAccess />}
          />
        </>
      )}
      {role === 'branch_manager' && (
        <>
          <Route path="/manager/leads" element={<ManagerLeads />} />
          <Route path="/manager/performance" element={<ManagerPerformance />} />
          <Route path="/manager/targets" element={<ManagerTargets />} />
          <Route path="/manager/reports" element={<ManagerReports />} />
          <Route path="/manager/employee/:id" element={<ManagerEmployeeReport />} />
          <Route path="/manager/my-attendance" element={<ManagerAttendance />} />
          <Route path="/manager/attendance" element={<ManagerAttendancePage />} />
          <Route path="/manager/my-leave" element={<ManagerMyLeave />} />
          <Route path="/manager/my-payslips" element={<ManagerMyPayslips />} />
          <Route path="/manager/policies" element={<ManagerPolicies />} />
          <Route path="/manager/reminders" element={<ManagerReminders />} />
          <Route path="/manager/tasks" element={<ManagerTasks />} />
          <Route path="/manager/notes" element={<ManagerNotes />} />
          <Route path="/manager/todos" element={<ManagerTodos />} />
          <Route path="/manager/activity" element={<ManagerTeamActivity />} />
          <Route path="/manager/customers" element={<ManagerCustomers />} />
          <Route path="/manager/greetings" element={<ManagerGreetings />} />
          <Route path="/manager/projects" element={<ManagerProjects />} />
          <Route path="/manager/quotations" element={<ManagerQuotations />} />
          <Route path="/manager/quotations/new" element={<ManagerQuotationEdit />} />
          <Route path="/manager/quotations/:id/preview" element={<ManagerQuotationView />} />
          <Route path="/manager/quotations/:id" element={<ManagerQuotationEdit />} />
          <Route path="/manager/*" element={<ManagerDashboard />} />
        </>
      )}
      {role === 'sales' && (
        <>
          <Route path="/sales/attendance" element={<SalesAttendance />} />
          <Route path="/sales/reminders" element={<SalesReminders />} />
          <Route path="/sales/tasks" element={<SalesTasks />} />
          <Route path="/sales/notes" element={<SalesNotes />} />
          <Route path="/sales/todos" element={<SalesTodos />} />
          <Route path="/sales/customers" element={<SalesCustomers />} />
          <Route path="/sales/greetings" element={<SalesGreetings />} />
          <Route path="/sales/projects" element={<SalesProjects />} />
          <Route path="/sales/quotations" element={<SalesQuotations />} />
          <Route path="/sales/quotations/new" element={<SalesQuotationEdit />} />
          <Route path="/sales/quotations/:id/preview" element={<SalesQuotationView />} />
          <Route path="/sales/quotations/:id" element={<SalesQuotationEdit />} />
          <Route path="/sales/my-leave" element={<SalesMyLeave />} />
          <Route path="/sales/my-payslips" element={<SalesMyPayslips />} />
          <Route path="/sales/policies" element={<SalesPolicies />} />
          <Route path="/sales/*" element={<SalesDashboard />} />
        </>
      )}
      {role === 'hr' && (
        <>
          <Route path="/hr/leads" element={<HrLeads />} />
          <Route path="/hr/employees" element={<HrEmployees />} />
          <Route path="/hr/scan-setup" element={<HrScanSetup />} />
          <Route path="/hr/my-attendance" element={<HrAttendance />} />
          <Route path="/hr/reminders" element={<HrReminders />} />
          <Route path="/hr/tasks" element={<HrTasks />} />
          <Route path="/hr/notes" element={<HrNotes />} />
          <Route path="/hr/todos" element={<HrTodos />} />
          <Route path="/hr/design-performance" element={<HrDesignPerformance />} />
          <Route path="/hr/attendance" element={<HrAttendanceAll />} />
          <Route path="/hr/my-leave" element={<HrMyLeavePage />} />
          <Route path="/hr/leaves" element={<HrLeavesPage />} />
          <Route path="/hr/setup" element={<HrSetupPage />} />
          <Route path="/hr/payroll" element={<HrPayrollPage />} />
          <Route path="/hr/payroll/:id" element={<HrEmployeePayrollPage />} />
          <Route path="/hr/assets" element={<HrAssetsPage />} />
          <Route path="/hr/my-payslips" element={<HrMyPayslips />} />
          <Route path="/hr/policies" element={<HrPolicies />} />
          <Route path="/hr/policies-manage" element={<HrPoliciesManage />} />
          <Route path="/hr/*" element={<HRDashboard />} />
        </>
      )}
      {role === 'design_team' && (
        <>
          <Route path="/design/attendance" element={<DesignAttendance />} />
          <Route path="/design/reminders" element={<DesignReminders />} />
          <Route path="/design/tasks" element={<DesignTasks />} />
          <Route path="/design/notes" element={<DesignNotes />} />
          <Route path="/design/todos" element={<DesignTodos />} />
          <Route path="/design/activity" element={<DesignTeamActivity />} />
          <Route path="/design/performance" element={<DesignPerformancePage />} />
          <Route path="/design/print" element={<DesignPrintRegister />} />
          <Route path="/design/projects" element={<DesignProjects />} />
          <Route path="/design/my-leave" element={<DesignMyLeave />} />
          <Route path="/design/my-payslips" element={<DesignMyPayslips />} />
          <Route path="/design/policies" element={<DesignPolicies />} />
          <Route path="/design/*" element={<DesignDashboard />} />
        </>
      )}
      <Route path="*" element={<Navigate to={home} />} />
    </Routes>
    </>
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