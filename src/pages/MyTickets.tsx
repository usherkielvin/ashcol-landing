import Tickets from './Tickets'

/** Negotiator's personal queue — thin wrapper around the shared Tickets table view. */
export default function MyTickets() {
  return <Tickets surface="my-tickets" />
}
