import { useParams } from 'react-router-dom'
import ManagerLayout from '../../components/ManagerLayout'
import EmployeeReport from '../../components/EmployeeReport'

export default function ManagerEmployeeReport() {
  const { id } = useParams()
  return <ManagerLayout>{id && <EmployeeReport key={id} userId={id} backTo="/manager/performance" />}</ManagerLayout>
}