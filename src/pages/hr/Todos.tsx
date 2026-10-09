import HrLayout from '../../components/HrLayout'
import TodoBoard from '../../components/todos/TodoBoard'

export default function HrTodos() {
  return (
    <HrLayout>
      <TodoBoard mineOnly />
    </HrLayout>
  )
}