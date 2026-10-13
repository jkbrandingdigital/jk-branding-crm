import ManagerLayout from '../../components/ManagerLayout'
import TeamActivity from '../../components/tasks/TeamActivity'

export default function ManagerTeamActivity() {
  return (
    <ManagerLayout>
      <TeamActivity tasksPath="/manager/tasks" />
    </ManagerLayout>
  )
}