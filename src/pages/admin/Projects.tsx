import AdminLayout from '../../components/AdminLayout'
import ProjectsBoard from '../../components/projects/ProjectsBoard'

export default function AdminProjects() {
  return (
    <AdminLayout>
      <ProjectsBoard tasksPath="/admin/tasks" />
    </AdminLayout>
  )
}