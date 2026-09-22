import { useParams } from 'react-router-dom'
import AdminLayout from '../../components/AdminLayout'
import EmployeeReport from '../../components/EmployeeReport'

export default function AdminEmployeeReport() {
  const { id } = useParams()
  return <AdminLayout>{id && <EmployeeReport key={id} userId={id} backTo="/admin/performance" />}</AdminLayout>
}