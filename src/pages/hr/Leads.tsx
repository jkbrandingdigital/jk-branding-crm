import HrLayout from '../../components/HrLayout'
import LeadsBoard from '../../components/leads/LeadsBoard'

export default function HrLeads() {
  return (
    <HrLayout>
      {/* HR's board is the hiring enquiries. The label is matched by
          name, so renaming it in Lead Settings renames it here too —
          and if it is missing the board is empty rather than full of
          the sales team's leads. */}
      <LeadsBoard scope="all" onlyLabel="Hiring" />
    </HrLayout>
  )
}