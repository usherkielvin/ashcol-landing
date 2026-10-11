/** Shared detection for the Robinson Appliances dealer (matches "Robinson", "Robinsons", or the "RA" abbreviation). */
export const ROBINSON_APPLIANCES_RE = /^(robinsons?|ra)\b/i

/** Branch part of a Robinson Appliances dealer string: "RA OLIVAREZ" / "Robinsons Appliances - Olivarez" → "OLIVAREZ". */
export function robinsonDealerBranch(dealer?: string | null): string {
  return (dealer || '').trim().replace(/^(robinsons?(\s+appliances)?|ra)\s*-?\s*/i, '').trim()
}

/** Combine a dealer name + branch into the saved dealer string, using the "RA <branch>" shorthand for Robinson Appliances. */
export function combineDealerForSave(dealerName: string, dealerBranch: string): string {
  const name = (dealerName || '').trim()
  const branch = (dealerBranch || '').trim()
  if (!name || name.toLowerCase() === 'direct') return 'Direct'
  if (ROBINSON_APPLIANCES_RE.test(name)) {
    // The name itself can still carry the branch ("RA OLIVAREZ" with an empty branch field) —
    // collapsing it to the bare shorthand here silently dropped the branch on every save.
    const resolvedBranch = branch || robinsonDealerBranch(name)
    return resolvedBranch ? `RA ${resolvedBranch}` : 'RA'
  }
  return branch ? `${name} - ${branch}` : name
}
