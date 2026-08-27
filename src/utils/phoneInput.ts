/** Formats digits as a Philippine mobile number while typing, e.g. "0917 869 4260". */
export function formatPhilippinePhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('63')) {
    digits = `0${digits.slice(2)}`
  } else if (digits.startsWith('9') && !digits.startsWith('09')) {
    digits = `0${digits}`
  }
  digits = digits.slice(0, 11)
  if (digits.length <= 4) return digits
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
}

/** Splits a pasted blob like "0917 869 4260   0946 735 5566" (or comma/newline separated) into
 *  separate phone numbers. Only tokens with >=10 digits count as a distinct number, so pasting a
 *  single already-spaced number ("0917 869 4260") still yields one token, not three. */
export function extractPhoneNumbers(raw: string): string[] {
  const tokens = raw.split(/[,;\n/]+|\s{2,}/).map(t => t.trim()).filter(Boolean)
  const candidates = tokens.length > 1 ? tokens : raw.trim().split(/\s+/)
  const numbers: string[] = []
  for (const tok of candidates) {
    const digits = tok.replace(/\D/g, '')
    if (digits.length >= 10) numbers.push(tok)
  }
  return numbers
}
