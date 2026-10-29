import { useNavigate } from 'react-router-dom'
import ReceptionLayout from '../../components/ReceptionLayout'
import AddVisitorForm from '../../components/reception/AddVisitorForm'

export default function ReceptionAddVisitor() {
  const nav = useNavigate()
  return (
    <ReceptionLayout active="add">
      <h1 className="mb-1 text-xl font-bold">Add Visitor</h1>
      <p className="mb-6 text-sm text-gray-500">Register a new office visit</p>
      <AddVisitorForm onSuccess={() => nav('/reception')} />
    </ReceptionLayout>
  )
}
