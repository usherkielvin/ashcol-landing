import Tickets from './Tickets'

/** Portal-wide ticket search (the "Search" nav item) — thin wrapper around the shared Tickets table view. */
export default function SearchTickets() {
  return <Tickets surface="search" />
}
