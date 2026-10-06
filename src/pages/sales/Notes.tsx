import SalesLayout from '../../components/SalesLayout'
import NotesBoard from '../../components/notes/NotesBoard'

export default function SalesNotes() {
  return (
    <SalesLayout active="notes">
      <NotesBoard />
    </SalesLayout>
  )
}