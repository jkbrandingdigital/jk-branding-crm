import ReceptionLayout from '../../components/ReceptionLayout'
import RemindersBoard from '../../components/reminders/RemindersBoard'

export default function ReceptionReminders() {
  return (
    <ReceptionLayout active="reminders">
      <RemindersBoard />
    </ReceptionLayout>
  )
}