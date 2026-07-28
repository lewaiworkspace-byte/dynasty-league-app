import ImportForm from './ImportForm'

// Route segment config: allow up to 60s for the import Server Action
// (fetching and processing a full-season nflverse file takes a while)
export const maxDuration = 60
export const revalidate = 0

export default function ImportStatsPage() {
  return <ImportForm />
}
