import ReceptionLayout from '../../components/ReceptionLayout'
import TodoBoard from '../../components/todos/TodoBoard'

export default function ReceptionTodos() {
  return (
    <ReceptionLayout active="todos">
      <TodoBoard mineOnly />
    </ReceptionLayout>
  )
}