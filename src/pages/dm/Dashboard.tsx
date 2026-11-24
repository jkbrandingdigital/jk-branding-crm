import DigitalLayout from '../../components/DigitalLayout'
import MyProjects from '../../components/dm/MyProjects'

// My day sits above this (DigitalLayout); below it, the projects they run.
export default function DmDashboard() {
  return (
    <DigitalLayout>
      <MyProjects limit={6} />
    </DigitalLayout>
  )
}
