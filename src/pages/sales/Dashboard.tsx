import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import SalesLayout, { type SalesPage } from '../../components/SalesLayout'
import PerformanceView from '../../components/PerformanceView'
import MyTargetCard from '../../components/MyTargetCard'
import EvolutionForm from './EvolutionForm'
import DailyReport from './DailyReport'
import LeadsBoard from '../../components/leads/LeadsBoard'
import { getCurrentUser } from '../../lib/auth'

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

  const [userId, setUserId] = useState<string | null>(null)
  useEffect(() => {
    getCurrentUser().then((u) => setUserId(u?.id ?? null))
  }, [])

  return (
    <SalesLayout active={page}>
      {page === 'evolution' && <EvolutionForm />}
      {page === 'report' && <DailyReport />}
      {page === 'leads' && <LeadsBoard />}
      {page === 'performance' && userId && (
        <>
          <div className="mx-auto mb-8 max-w-6xl">
            <MyTargetCard />
          </div>
          <PerformanceView userId={userId} title="My Performance" subtitle="Your calls, leads and revenue over time." />
        </>
      )}
    </SalesLayout>
  )
}