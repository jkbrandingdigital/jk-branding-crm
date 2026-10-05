import SalesLayout from '../../components/SalesLayout'
import TaskBoard from '../../components/tasks/TaskBoard'

export default function SalesTasks() {
  return (
    <SalesLayout active="tasks">
      <TaskBoard />
    </SalesLayout>
  )
}