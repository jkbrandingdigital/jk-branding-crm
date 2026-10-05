import SalesLayout from '../../components/SalesLayout'
import RemindersBoard from '../../components/reminders/RemindersBoard'

export default function SalesReminders() {
  return (
    <SalesLayout active="reminders">
      <RemindersBoard />
    </SalesLayout>
  )
}