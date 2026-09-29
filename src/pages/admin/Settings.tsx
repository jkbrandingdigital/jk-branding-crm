import { useSearchParams } from 'react-router-dom'
import { Plug, Tag } from 'lucide-react'
import AdminLayout from '../../components/AdminLayout'
import IntegrationsTab from '../../components/settings/IntegrationsTab'
import LeadLabels from '../../components/leads/LeadLabels'

// Add more tabs here later (General, Notifications…)
const TABS = [
  { key: 'integrations', label: 'Integrations', icon: Plug },
  { key: 'labels', label: 'Lead Labels', icon: Tag },
]

export default function AdminSettings() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab')! : TABS[0].key

  const open = (key: string) => {
    const next = new URLSearchParams(params)
    next.set('tab', key)
    setParams(next, { replace: true })
  }

  return (
    <AdminLayout>
      <div className="max-w-5xl">
        <h1 className="text-2xl font-semibold text-white">General Settings</h1>
        <p className="mt-1 text-sm text-gray-400">Company-wide settings for the CRM.</p>

        <div role="tablist" className="mt-5 flex gap-1 border-b border-[#242424]">
          {TABS.map((t) => {
            const Icon = t.icon
            const active = tab === t.key
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => open(t.key)}
                className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500 ${
                  active ? 'border-orange-500 text-white' : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            )
          })}
        </div>

        <div className="mt-6">
          {tab === 'integrations' && <IntegrationsTab />}
          {tab === 'labels' && <LeadLabels />}
        </div>
      </div>
    </AdminLayout>
  )
}