import Tickets from './Tickets'

/** Date-grouped branch schedule board — thin wrapper around the shared Tickets table view. */
export default function Schedules() {
  return <Tickets surface="schedules" />
}
