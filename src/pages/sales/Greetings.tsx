import SalesLayout from '../../components/SalesLayout'
import GreetingsBoard from '../../components/customers/GreetingsBoard'

export default function SalesGreetings() {
  return (
    <SalesLayout active="greetings">
      <GreetingsBoard />
    </SalesLayout>
  )
}