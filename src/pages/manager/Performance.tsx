import { useEffect, useState } from 'react'
import ManagerLayout from '../../components/ManagerLayout'
import SalesPerformance from '../../components/SalesPerformance'
import { getCurrentUser, getUserProfile } from '../../lib/auth'

export default function ManagerPerformance() {
  const [branchId, setBranchId] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const user = await getCurrentUser()
      if (!user) return
      const profile = await getUserProfile(user.id)
      setBranchId(profile?.branch_id ?? null)
    })()
  }, [])

  return <ManagerLayout>{branchId && <SalesPerformance lockedBranchId={branchId} />}</ManagerLayout>
}