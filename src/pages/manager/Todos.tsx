import ManagerLayout from '../../components/ManagerLayout'
import TodoBoard from '../../components/todos/TodoBoard'

export default function ManagerTodos() {
  return (
    <ManagerLayout>
      <TodoBoard mineOnly />
    </ManagerLayout>
  )
}