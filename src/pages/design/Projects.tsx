import DesignLayout from '../../components/DesignLayout'
import ProjectsBoard from '../../components/projects/ProjectsBoard'

export default function DesignProjects() {
  return (
    <DesignLayout>
      <ProjectsBoard tasksPath="/design/tasks" />
    </DesignLayout>
  )
}