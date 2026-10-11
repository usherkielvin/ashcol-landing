import type { PublicBranch } from './branches'
import { PUBLIC_BRANCHES } from './branches'

function formatBranchBlock(b: PublicBranch): string {
  const hq = b.isHQ ? ' [HEAD OFFICE]' : ''
  const region = b.region ? ` Region: ${b.region}.` : ''
  const mobiles = `Mobile: ${b.phones.join(', ')}.`
  const land = b.landline ? ` Landline: ${b.landline}.` : ''
  const map = b.mapUrl?.trim() ? ` Google Maps: ${b.mapUrl}` : ''
  return (
    `${b.name}${hq} (${b.tag}).${region}\n` +
    `Address: ${b.address}\n${mobiles}${land}\nEmail: ${b.email}.${map ? ` ${map}` : ''}`
  )
}

/**
 * Full branch facts for AI system prompts (built from {@link PUBLIC_BRANCHES}).
 * Vercel `/api/chat` cannot import this file — it uses `api/branchKnowledge.ts` instead; keep both in sync.
 * Spring uses `ai/ashcol-branches-prompt.txt`.
 */
export function buildAshcolBranchesKnowledgeBlock(): string {
  const rows = PUBLIC_BRANCHES.map(formatBranchBlock)
  return (
    'OFFICIAL ASHCOL BRANCH DIRECTORY — Use only this data for addresses, phones, emails, and regions. ' +
    'If the user asks for a branch not listed, say ASHCOL may have updated locations and suggest Head Office or the portal. ' +
    'Do not invent phone numbers or addresses.\n\n' +
    rows.join('\n\n')
  )
}

export const ASHCOL_BRANCHES_FOR_AI = buildAshcolBranchesKnowledgeBlock()
