import SalesLayout from '../../components/SalesLayout'
import TodoBoard from '../../components/todos/TodoBoard'

export default function SalesTodos() {
  return (
    <SalesLayout active="todos">
      <TodoBoard mineOnly />
    </SalesLayout>
  )
}