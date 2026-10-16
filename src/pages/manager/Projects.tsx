import ManagerLayout from '../../components/ManagerLayout'
import ProjectsBoard from '../../components/projects/ProjectsBoard'

export default function ManagerProjects() {
  return (
    <ManagerLayout>
      <ProjectsBoard tasksPath="/manager/tasks" />
    </ManagerLayout>
  )
}