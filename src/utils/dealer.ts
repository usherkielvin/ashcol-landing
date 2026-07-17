/** Shared detection for the Robinson Appliances dealer (matches "Robinson", "Robinsons", or the "RA" abbreviation). */
export const ROBINSON_APPLIANCES_RE = /^(robinsons?|ra)\b/i

/** Combine a dealer name + branch into the saved dealer string, using the "RA <branch>" shorthand for Robinson Appliances. */
export function combineDealerForSave(dealerName: string, dealerBranch: string): string {
  const name = (dealerName || '').trim()
  const branch = (dealerBranch || '').trim()
  if (!name || name.toLowerCase() === 'direct') return 'Direct'
  if (ROBINSON_APPLIANCES_RE.test(name)) {
    return branch ? `RA ${branch}` : 'RA'
  }
  return branch ? `${name} - ${branch}` : name
}
