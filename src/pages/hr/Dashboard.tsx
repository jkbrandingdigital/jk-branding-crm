import Header from '../../components/Header'

export default function HRDashboard() {
  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="p-8">
        <h1 className="text-2xl font-bold text-orange-500">HR Dashboard</h1>
        <p className="text-gray-400 mt-2">Welcome, HR Manager!</p>
      </div>
    </div>
  )
}