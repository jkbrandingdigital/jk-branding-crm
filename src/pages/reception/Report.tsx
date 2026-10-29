import ReceptionLayout from '../../components/ReceptionLayout'
import VisitorReport from '../../components/reception/VisitorReport'

export default function ReceptionReport() {
  return (
    <ReceptionLayout active="report">
      <h1 className="mb-1 text-xl font-bold">Visitor Report</h1>
      <p className="mb-6 text-sm text-gray-500">History, filters & Excel export</p>
      <VisitorReport />
    </ReceptionLayout>
  )
}
