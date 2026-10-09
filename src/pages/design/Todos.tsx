import DesignLayout from '../../components/DesignLayout'
import TodoBoard from '../../components/todos/TodoBoard'

export default function DesignTodos() {
  return (
    <DesignLayout>
      <TodoBoard mineOnly />
    </DesignLayout>
  )
}