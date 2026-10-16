import SalesLayout from '../../components/SalesLayout'
import ProjectsBoard from '../../components/projects/ProjectsBoard'

export default function SalesProjects() {
  return (
    <SalesLayout active="projects">
      <ProjectsBoard tasksPath="/sales/tasks" />
    </SalesLayout>
  )
}