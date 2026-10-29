import HrLayout from '../../components/HrLayout'
import VisitorReport from '../../components/reception/VisitorReport'

export default function HrReceptionReport() {
  return (
    <HrLayout>
      <h1 className="mb-1 text-xl font-bold">Visitor Report</h1>
      <p className="mb-6 text-sm text-gray-500">History, filters & Excel export</p>
      <VisitorReport />
    </HrLayout>
  )
}