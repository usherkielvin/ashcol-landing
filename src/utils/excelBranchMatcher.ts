/**
 * Excel Dealer Matcher (Local Fuzzy Matching — No AI Required)
 *
 * Parses raw Excel DLR column values and matches them to existing dealers
 * using smart prefix/fuzzy matching. No API key needed.
 *
 * Strategy:
 * 1. Check if raw string starts with a known dealer name (longest match first)
 * 2. Extract the branch/location from the remainder
 * 3. Fall back to word-overlap fuzzy matching
 */

export interface BranchMatchResult {
  dealerBranch: string
  matchedBranchId: string | null
  matchedBranchName: string | null
  confidence: 'exact' | 'fuzzy' | 'ai' | 'none'
}

export interface DealerParseResult {
  /** Original raw DLR value from Excel */
  raw: string
  /** Parsed dealer name */
  dealer: string
  /** Parsed dealer branch/location */
  dealerBranch: string
  /** Matched existing dealer ID (null if no match) */
  matchedDealerId: string | null
  /** Matched existing dealer name */
  matchedDealerName: string | null
  /** Whether this was resolved */
  matched: boolean
}

interface Branch {
  id: string
  name: string
}

// ─── Normalization ───────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toUpperCase()
    .replace(/[@]/g, ' AT ')
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Local Dealer Matching ───────────────────────────────────────────────────

/**
 * Try to find which existing dealer the raw DLR string belongs to.
 * Uses longest-prefix matching: sorts dealers by name length (desc) and
 * checks if the raw string starts with that dealer name.
 */
function matchDealerByPrefix(
  raw: string,
  dealers: Branch[],
): { dealer: Branch | null; remainder: string } {
  const norm = normalize(raw)

  // Sort dealers by name length descending — try longest names first
  // e.g. "ANSONS AT HOME" should match before "ANSON"
  const sorted = [...dealers].sort((a, b) => b.name.length - a.name.length)

  for (const dealer of sorted) {
    const dealerNorm = normalize(dealer.name)
    if (!dealerNorm) continue

    // Check if raw starts with this dealer name
    if (norm.startsWith(dealerNorm)) {
      const remainder = norm.slice(dealerNorm.length).trim()
      return { dealer, remainder }
    }

    // Also check without spaces (e.g. "ANSONS@HOME" vs "ANSONS AT HOME")
    const dealerNoSpace = dealerNorm.replace(/\s+/g, '')
    const normNoSpace = norm.replace(/\s+/g, '')
    if (normNoSpace.startsWith(dealerNoSpace)) {
      const charCount = dealerNorm.length
      const remainder = norm.slice(charCount).trim()
      return { dealer, remainder }
    }
  }

  // Try word-based matching: if first 1-3 words match a dealer
  const words = norm.split(/\s+/)
  for (let wordCount = Math.min(3, words.length); wordCount >= 1; wordCount--) {
    const prefix = words.slice(0, wordCount).join(' ')
    for (const dealer of sorted) {
      const dealerNorm = normalize(dealer.name)
      if (dealerNorm === prefix) {
        const remainder = words.slice(wordCount).join(' ')
        return { dealer, remainder }
      }
    }
  }

  return { dealer: null, remainder: norm }
}

// ─── Full Pipeline ───────────────────────────────────────────────────────────

export interface DealerMatchSummary {
  /** Map from raw DLR string → parsed result with matched dealer */
  parsed: Map<string, DealerParseResult>
  /** Dealer names that couldn't be matched to existing dealers */
  unmatchedDealers: string[]
}

/**
 * Full dealer matching pipeline (no AI):
 * 1. For each unique raw DLR string, try prefix matching against existing dealers
 * 2. Extract branch/location from the remainder
 * 3. Return results + unmatched list
 */
export async function matchExcelDealers(
  rawDealerStrings: string[],
  existingDealers: { id: string; name: string }[],
): Promise<DealerMatchSummary> {
  const parsed = new Map<string, DealerParseResult>()
  const unmatchedSet = new Set<string>()

  const unique = [...new Set(rawDealerStrings.filter(s => s.trim()))]

  for (const raw of unique) {
    const { dealer, remainder } = matchDealerByPrefix(raw, existingDealers)

    if (dealer) {
      parsed.set(raw, {
        raw,
        dealer: dealer.name,
        dealerBranch: remainder,
        matchedDealerId: dealer.id,
        matchedDealerName: dealer.name,
        matched: true,
      })
    } else {
      // Unmatched — keep raw as dealer name
      parsed.set(raw, {
        raw,
        dealer: raw,
        dealerBranch: '',
        matchedDealerId: null,
        matchedDealerName: null,
        matched: false,
      })
      unmatchedSet.add(raw)
    }
  }

  return { parsed, unmatchedDealers: [...unmatchedSet] }
}

/**
 * Simple name-to-list fuzzy matcher (used for branch matching)
 */
export function matchBranchLocally(
  name: string,
  list: Branch[],
): BranchMatchResult {
  if (!name?.trim()) {
    return { dealerBranch: name, matchedBranchId: null, matchedBranchName: null, confidence: 'none' }
  }

  const norm = normalize(name)

  // Exact match
  for (const item of list) {
    if (normalize(item.name) === norm) {
      return { dealerBranch: name, matchedBranchId: item.id, matchedBranchName: item.name, confidence: 'exact' }
    }
  }

  // Contains match
  for (const item of list) {
    const itemNorm = normalize(item.name)
    if (norm.includes(itemNorm) || itemNorm.includes(norm)) {
      if (itemNorm.length >= 3 && norm.length >= 3) {
        return { dealerBranch: name, matchedBranchId: item.id, matchedBranchName: item.name, confidence: 'fuzzy' }
      }
    }
  }

  return { dealerBranch: name, matchedBranchId: null, matchedBranchName: null, confidence: 'none' }
}

/**
 * Legacy wrapper for branch matching
 */
export async function matchExcelBranches(
  names: string[],
  existingList: Branch[],
): Promise<{ matches: Map<string, BranchMatchResult>; unmatchedBranches: string[] }> {
  const matches = new Map<string, BranchMatchResult>()
  const uniqueNames = [...new Set(names.filter(b => b.trim()))]

  for (const name of uniqueNames) {
    matches.set(name, matchBranchLocally(name, existingList))
  }

  const unmatchedBranches = uniqueNames.filter(n => {
    const r = matches.get(n)
    return !r || r.confidence === 'none'
  })

  return { matches, unmatchedBranches }
}
