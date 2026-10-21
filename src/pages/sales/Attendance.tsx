import SalesLayout from '../../components/SalesLayout'
import MyAttendance from '../../components/attendance/MyAttendance'

export default function SalesAttendance() {
  // SalesLayout routes by name, not path, so it needs to be told which
  // item is the current one.
  return (
    <SalesLayout active="attendance">
      <MyAttendance />
    </SalesLayout>
  )
}