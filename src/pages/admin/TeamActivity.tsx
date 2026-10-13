import AdminLayout from '../../components/AdminLayout'
import TeamActivity from '../../components/tasks/TeamActivity'

export default function AdminTeamActivity() {
  return (
    <AdminLayout>
      <TeamActivity tasksPath="/admin/tasks" />
    </AdminLayout>
  )
}