import { useSearchParams } from 'react-router-dom'
import SalesLayout, { type SalesPage } from '../../components/SalesLayout'
import SalesPerformance from '../../components/SalesPerformance'
import EvolutionForm from './EvolutionForm'
import DailyReport from './DailyReport'
import LeadsBoard from '../../components/leads/LeadsBoard'

const PAGES: SalesPage[] = ['evolution', 'report', 'performance', 'leads']

// Morning (before 2 PM IST) opens the Evolution Form, evening opens the Daily Report
function defaultPage(): SalesPage {
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }))
  return hour < 14 ? 'evolution' : 'report'
}

export default function SalesDashboard() {
  const [searchParams] = useSearchParams()
  const param = searchParams.get('page') as SalesPage | null
  const page: SalesPage = param && PAGES.includes(param) ? param : defaultPage()

  return (
    <SalesLayout active={page}>
      {page === 'evolution' && <EvolutionForm />}
      {page === 'report' && <DailyReport />}
      {page === 'leads' && <LeadsBoard />}

      {/*
        My Performance is now the same screen the admin sees, with
        `selfOnly` on: this person only, no branch or employee picker,
        no branch comparison.

        It replaces MyTargetCard and the bare PerformanceView that used
        to sit here. Both are inside it now — the target card became the
        Target tab, and PerformanceView's charts sit under Activity.
        Keeping the old card as well would have put two "achieved"
        figures on one screen, drawn from two different places, and
        whichever one was lower would have started an argument.

        It finds the signed-in person itself, so there is no user id to
        pass down and nothing to wait for before the first paint.
      */}
      {page === 'performance' && <SalesPerformance selfOnly />}
    </SalesLayout>
  )
}