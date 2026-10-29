// "Me" page — wraps the shared MyAttendance component.
// NOTE: if your sales version imports a different component/path,
// copy pages/sales/Attendance.tsx and just swap the layout + active.
import ReceptionLayout from '../../components/ReceptionLayout'
import MyAttendance from '../../components/attendance/MyAttendance'

export default function ReceptionAttendance() {
  return (
    <ReceptionLayout active="attendance">
      <MyAttendance />
    </ReceptionLayout>
  )
}
