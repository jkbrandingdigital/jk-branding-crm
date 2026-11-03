import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import ManagerLayout from '../../components/ManagerLayout'
import EmployeeReport from '../../components/EmployeeReport'
import { supabase } from '../../lib/supabase'

/*
  The URL may carry a real user id (a uuid) or an employee code (SP016).
  The code reads better in the address bar; this resolves either one to the
  id the report needs, so the pretty links and the old uuid links both work.
*/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function ManagerEmployeeReport() {
  const { id } = useParams()
  const [userId, setUserId] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let alive = true
    setUserId(null)
    setMissing(false)
    if (!id) return
    if (UUID.test(id)) {
      setUserId(id)
      return
    }
    ;(async () => {
      const { data } = await supabase.from('profiles').select('id').ilike('emp_code', id).maybeSingle()
      if (!alive) return
      if (data?.id) setUserId(data.id)
      else setMissing(true)
    })()
    return () => { alive = false }
  }, [id])

  return (
    <ManagerLayout>
      {userId && <EmployeeReport key={userId} userId={userId} backTo="/manager/performance" />}
      {missing && (
        <p className="py-16 text-center text-sm text-gray-500">No employee with code “{id}”.</p>
      )}
    </ManagerLayout>
  )
}