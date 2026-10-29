import ReceptionLayout from '../../components/ReceptionLayout'
import NotesBoard from '../../components/notes/NotesBoard'

export default function ReceptionNotes() {
  return (
    <ReceptionLayout active="notes">
      <NotesBoard />
    </ReceptionLayout>
  )
}