/**
 * Utility to guess/extract Philippine districts, cities, and municipalities from address strings.
 * Used for auto-filling the District field on Relay Ticket creation and edit forms.
 */

// Ordered dictionary of known cities, towns, and districts (longest/most specific names first)
const TOWNS_MAP: { key: string; label: string }[] = [
  // ── Metro Manila / NCR ───────────────────────────────────────────────────
  { key: 'bonifacio global city', label: 'TAGUIG CITY' },
  { key: 'marikina city', label: 'MARIKINA CITY' },
  { key: 'quezon city', label: 'QUEZON CITY' },
  { key: 'pasig city', label: 'PASIG CITY' },
  { key: 'taguig city', label: 'TAGUIG CITY' },
  { key: 'makati city', label: 'MAKATI CITY' },
  { key: 'mandaluyong city', label: 'MANDALUYONG CITY' },
  { key: 'manila city', label: 'MANILA CITY' },
  { key: 'city of manila', label: 'MANILA CITY' },
  { key: 'pasay city', label: 'PASAY CITY' },
  { key: 'caloocan city', label: 'CALOOCAN CITY' },
  { key: 'kalookan city', label: 'CALOOCAN CITY' },
  { key: 'malabon city', label: 'MALABON CITY' },
  { key: 'navotas city', label: 'NAVOTAS CITY' },
  { key: 'valenzuela city', label: 'VALENZUELA CITY' },
  { key: 'san juan city', label: 'SAN JUAN CITY' },
  { key: 'parañaque city', label: 'PARANAQUE CITY' },
  { key: 'paranaque city', label: 'PARANAQUE CITY' },
  { key: 'las piñas city', label: 'LAS PINAS CITY' },
  { key: 'las pinas city', label: 'LAS PINAS CITY' },
  { key: 'muntinlupa city', label: 'MUNTINLUPA CITY' },
  { key: 'marikina', label: 'MARIKINA CITY' },
  { key: 'pasig', label: 'PASIG CITY' },
  { key: 'taguig', label: 'TAGUIG CITY' },
  { key: 'bgc', label: 'TAGUIG CITY' },
  { key: 'makati', label: 'MAKATI CITY' },
  { key: 'mandaluyong', label: 'MANDALUYONG CITY' },
  { key: 'pasay', label: 'PASAY CITY' },
  { key: 'caloocan', label: 'CALOOCAN CITY' },
  { key: 'kalookan', label: 'CALOOCAN CITY' },
  { key: 'malabon', label: 'MALABON CITY' },
  { key: 'navotas', label: 'NAVOTAS CITY' },
  { key: 'valenzuela', label: 'VALENZUELA CITY' },
  { key: 'san juan', label: 'SAN JUAN CITY' },
  { key: 'parañaque', label: 'PARANAQUE CITY' },
  { key: 'paranaque', label: 'PARANAQUE CITY' },
  { key: 'las piñas', label: 'LAS PINAS CITY' },
  { key: 'las pinas', label: 'LAS PINAS CITY' },
  { key: 'muntinlupa', label: 'MUNTINLUPA CITY' },
  { key: 'pateros', label: 'PATEROS' },
  { key: 'qc', label: 'QUEZON CITY' },

  // ── Rizal ─────────────────────────────────────────────────────────────────
  { key: 'antipolo city', label: 'ANTIPOLO CITY' },
  { key: 'antipolo', label: 'ANTIPOLO CITY' },
  { key: 'cainta', label: 'CAINTA' },
  { key: 'taytay', label: 'TAYTAY' },
  { key: 'angono', label: 'ANGONO' },
  { key: 'binangonan', label: 'BINANGONAN' },
  { key: 'tayuman', label: 'BINANGONAN' },
  { key: 'san mateo', label: 'SAN MATEO' },
  { key: 'rodriguez', label: 'RODRIGUEZ' },
  { key: 'montalban', label: 'RODRIGUEZ' },
  { key: 'teresa', label: 'TERESA' },
  { key: 'morong', label: 'MORONG' },
  { key: 'baras', label: 'BARAS' },
  { key: 'tanay', label: 'TANAY' },
  { key: 'pililla', label: 'PILILLA' },
  { key: 'jala-jala', label: 'JALA-JALA' },
  { key: 'jalajala', label: 'JALA-JALA' },

  // ── Cavite ────────────────────────────────────────────────────────────────
  { key: 'general trias city', label: 'GENERAL TRIAS CITY' },
  { key: 'general trias', label: 'GENERAL TRIAS CITY' },
  { key: 'gen. trias', label: 'GENERAL TRIAS CITY' },
  { key: 'gentri', label: 'GENERAL TRIAS CITY' },
  { key: 'trece martires city', label: 'TRECE MARTIRES CITY' },
  { key: 'trece martires', label: 'TRECE MARTIRES CITY' },
  { key: 'dasmarinas city', label: 'DASMARINAS CITY' },
  { key: 'dasmariñas city', label: 'DASMARINAS CITY' },
  { key: 'dasmarinas', label: 'DASMARINAS CITY' },
  { key: 'dasmariñas', label: 'DASMARINAS CITY' },
  { key: 'dasma', label: 'DASMARINAS CITY' },
  { key: 'bacoor city', label: 'BACOOR CITY' },
  { key: 'bacoor', label: 'BACOOR CITY' },
  { key: 'imus city', label: 'IMUS CITY' },
  { key: 'imus', label: 'IMUS CITY' },
  { key: 'tagaytay city', label: 'TAGAYTAY CITY' },
  { key: 'tagaytay', label: 'TAGAYTAY CITY' },
  { key: 'cavite city', label: 'CAVITE CITY' },
  { key: 'carmona city', label: 'CARMONA CITY' },
  { key: 'carmona', label: 'CARMONA CITY' },
  { key: 'silang', label: 'SILANG' },
  { key: 'kawit', label: 'KAWIT' },
  { key: 'noveleta', label: 'NOVELETA' },
  { key: 'rosario', label: 'ROSARIO' },
  { key: 'tanza', label: 'TANZA' },
  { key: 'naic', label: 'NAIC' },
  { key: 'indang', label: 'INDANG' },
  { key: 'alfonso', label: 'ALFONSO' },
  { key: 'amadeo', label: 'AMADEO' },
  { key: 'mendez', label: 'MENDEZ' },
  { key: 'maragondon', label: 'MARAGONDON' },
  { key: 'ternate', label: 'TERNATE' },
  { key: 'magallanes', label: 'MAGALLANES' },

  // ── Laguna ────────────────────────────────────────────────────────────────
  { key: 'santa rosa city', label: 'SANTA ROSA CITY' },
  { key: 'sta. rosa city', label: 'SANTA ROSA CITY' },
  { key: 'sta rosa city', label: 'SANTA ROSA CITY' },
  { key: 'santa rosa', label: 'SANTA ROSA CITY' },
  { key: 'sta. rosa', label: 'SANTA ROSA CITY' },
  { key: 'sta rosa', label: 'SANTA ROSA CITY' },
  { key: 'calamba city', label: 'CALAMBA CITY' },
  { key: 'calamba', label: 'CALAMBA CITY' },
  { key: 'binan city', label: 'BINAN CITY' },
  { key: 'biñan city', label: 'BINAN CITY' },
  { key: 'binan', label: 'BINAN CITY' },
  { key: 'biñan', label: 'BINAN CITY' },
  { key: 'cabuyao city', label: 'CABUYAO CITY' },
  { key: 'cabuyao', label: 'CABUYAO CITY' },
  { key: 'san pedro city', label: 'SAN PEDRO CITY' },
  { key: 'san pedro', label: 'SAN PEDRO CITY' },
  { key: 'san pablo city', label: 'SAN PABLO CITY' },
  { key: 'san pablo', label: 'SAN PABLO CITY' },
  { key: 'santa cruz', label: 'SANTA CRUZ' },
  { key: 'sta. cruz', label: 'SANTA CRUZ' },
  { key: 'sta cruz', label: 'SANTA CRUZ' },
  { key: 'los banos', label: 'LOS BANOS' },
  { key: 'los baños', label: 'LOS BANOS' },
  { key: 'calauan', label: 'CALAUAN' },
  { key: 'bay', label: 'BAY' },
  { key: 'pagsanjan', label: 'PAGSANJAN' },
  { key: 'pila', label: 'PILA' },
  { key: 'siniloan', label: 'SINILOAN' },
  { key: 'pangil', label: 'PANGIL' },
  { key: 'lumban', label: 'LUMBAN' },
  { key: 'paete', label: 'PAETE' },
  { key: 'pakil', label: 'PAKIL' },
  { key: 'victoria', label: 'VICTORIA' },
  { key: 'nagcarlan', label: 'NAGCARLAN' },
  { key: 'liliw', label: 'LILIW' },
  { key: 'majayjay', label: 'MAJAYJAY' },
  { key: 'magdalena', label: 'MAGDALENA' },
  { key: 'alaminos', label: 'ALAMINOS' },
  { key: 'famy', label: 'FAMY' },
  { key: 'mabitac', label: 'MABITAC' },
  { key: 'santa maria', label: 'SANTA MARIA' },
  { key: 'sta. maria', label: 'SANTA MARIA' },

  // ── Batangas ──────────────────────────────────────────────────────────────
  { key: 'batangas city', label: 'BATANGAS CITY' },
  { key: 'lipa city', label: 'LIPA CITY' },
  { key: 'lipa', label: 'LIPA CITY' },
  { key: 'tanauan city', label: 'TANAUAN CITY' },
  { key: 'tanauan', label: 'TANAUAN CITY' },
  { key: 'sto. tomas city', label: 'STO. TOMAS CITY' },
  { key: 'sto tomas city', label: 'STO. TOMAS CITY' },
  { key: 'santo tomas city', label: 'STO. TOMAS CITY' },
  { key: 'sto. tomas', label: 'STO. TOMAS CITY' },
  { key: 'sto tomas', label: 'STO. TOMAS CITY' },
  { key: 'santo tomas', label: 'STO. TOMAS CITY' },
  { key: 'calaca city', label: 'CALACA CITY' },
  { key: 'calaca', label: 'CALACA CITY' },
  { key: 'nasugbu', label: 'NASUGBU' },
  { key: 'lemery', label: 'LEMERY' },
  { key: 'bauan', label: 'BAUAN' },
  { key: 'balayan', label: 'BALAYAN' },
  { key: 'taal', label: 'TAAL' },
  { key: 'san jose', label: 'SAN JOSE' },
  { key: 'san pascual', label: 'SAN PASCUAL' },
  { key: 'mabini', label: 'MABINI' },
  { key: 'calatagan', label: 'CALATAGAN' },
  { key: 'lian', label: 'LIAN' },
  { key: 'tuy', label: 'TUY' },
  { key: 'alitagtag', label: 'ALITAGTAG' },
  { key: 'cuenca', label: 'CUENCA' },
  { key: 'malvar', label: 'MALVAR' },
  { key: 'laurel', label: 'LAUREL' },
  { key: 'talisay', label: 'TALISAY' },

  // ── Bulacan ───────────────────────────────────────────────────────────────
  { key: 'san jose del monte city', label: 'SAN JOSE DEL MONTE CITY' },
  { key: 'san jose del monte', label: 'SAN JOSE DEL MONTE CITY' },
  { key: 'sjdm', label: 'SAN JOSE DEL MONTE CITY' },
  { key: 'malolos city', label: 'MALOLOS CITY' },
  { key: 'malolos', label: 'MALOLOS CITY' },
  { key: 'meycauayan city', label: 'MEYCAUAYAN CITY' },
  { key: 'meycauayan', label: 'MEYCAUAYAN CITY' },
  { key: 'baliuag city', label: 'BALIUAG CITY' },
  { key: 'baliuag', label: 'BALIUAG CITY' },
  { key: 'marilao', label: 'MARILAO' },
  { key: 'bocaue', label: 'BOCAUE' },
  { key: 'guiguinto', label: 'GUIGUINTO' },
  { key: 'balagtas', label: 'BALAGTAS' },
  { key: 'pandi', label: 'PANDI' },
  { key: 'plaridel', label: 'PLARIDEL' },
  { key: 'pulilan', label: 'PULILAN' },
  { key: 'calumpit', label: 'CALUMPIT' },
  { key: 'hagonoy', label: 'HAGONOY' },
  { key: 'paombong', label: 'PAOMBONG' },
  { key: 'bulakan', label: 'BULAKAN' },
  { key: 'obando', label: 'OBANDO' },
  { key: 'norzagaray', label: 'NORZAGARAY' },
  { key: 'san rafael', label: 'SAN RAFAEL' },
  { key: 'san ildefonso', label: 'SAN ILDEFONSO' },
  { key: 'san miguel', label: 'SAN MIGUEL' },
  { key: 'dona remedios trinidad', label: 'DONA REMEDIOS TRINIDAD' },
  { key: 'drt', label: 'DONA REMEDIOS TRINIDAD' },

  // ── Pampanga ──────────────────────────────────────────────────────────────
  { key: 'san fernando city', label: 'SAN FERNANDO CITY' },
  { key: 'san fernando', label: 'SAN FERNANDO CITY' },
  { key: 'angeles city', label: 'ANGELES CITY' },
  { key: 'angeles', label: 'ANGELES CITY' },
  { key: 'mabalacat city', label: 'MABALACAT CITY' },
  { key: 'mabalacat', label: 'MABALACAT CITY' },
  { key: 'guagua', label: 'GUAGUA' },
  { key: 'lubao', label: 'LUBAO' },
  { key: 'floridablanca', label: 'FLORIDABLANCA' },
  { key: 'porac', label: 'PORAC' },
  { key: 'apalit', label: 'APALIT' },
  { key: 'mexico', label: 'MEXICO' },
  { key: 'arayat', label: 'ARAYAT' },
  { key: 'candaba', label: 'CANDABA' },

  // ── Quezon Province ───────────────────────────────────────────────────────
  { key: 'lucena city', label: 'LUCENA CITY' },
  { key: 'lucena', label: 'LUCENA CITY' },
  { key: 'tayabas city', label: 'TAYABAS CITY' },
  { key: 'tayabas', label: 'TAYABAS CITY' },
  { key: 'candelaria', label: 'CANDELARIA' },
  { key: 'sariaya', label: 'SARIAYA' },
  { key: 'tiaong', label: 'TIAONG' },
  { key: 'pagbilao', label: 'PAGBILAO' },
  { key: 'dolores', label: 'DOLORES' },
  { key: 'san antonio', label: 'SAN ANTONIO' },
]

function matchTownKey(text: string): string | null {
  for (const t of TOWNS_MAP) {
    const regex = new RegExp(`(^|[^a-zA-Z0-9])${t.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-zA-Z0-9])`, 'i')
    if (regex.test(text)) {
      return t.label
    }
  }
  return null
}

export function guessDistrict(address: string): string {
  if (!address) return ''
  const cleanAddr = address.trim()
  if (!cleanAddr) return ''
  const addrLower = cleanAddr.toLowerCase()

  // 1. Direct Regex checks for explicit district declarations (e.g. "District 2", "Dist. 1")
  const districtRegexes = [
    /district\s*([0-9]+)/i,
    /dist\.\s*([0-9]+)/i,
    /dist\s*([0-9]+)/i,
    /district\s*([ivxldcm]+)/i,
    /zone\s*([0-9]+)/i,
    /zone\s*([ivxldcm]+)/i,
  ]

  for (const regex of districtRegexes) {
    const match = cleanAddr.match(regex)
    if (match && match[1]) {
      const val = match[1].trim()
      if (/^[0-9]+$/.test(val)) {
        return `District ${val}`
      }
      return `District ${val.toUpperCase()}`
    }
  }

  // 2. Keyword-based matching for Valenzuela City barangays
  if (addrLower.includes('valenzuela')) {
    const d1Barangays = [
      'arkong bato', 'balangkas', 'bignay', 'bisig', 'canumay east', 'canumay west',
      'coloong', 'dalandanan', 'isla', 'lawang bato', 'lingunan', 'mabolo', 'malanday',
      'malinta', 'palasan', 'pasolo', 'poblacion', 'punturin', 'rincon', 'tagalag',
      'veinte reales', 'wawang pulo',
    ]
    const d2Barangays = [
      'bagbaguin', 'karuhatan', 'gen. t. de leon', 'gtdl', 'mapulang lupa', 'marulas',
      'maysan', 'parada', 'paso de blas', 'ugong',
    ]

    for (const brgy of d1Barangays) {
      if (addrLower.includes(brgy)) return 'District 1'
    }
    for (const brgy of d2Barangays) {
      if (addrLower.includes(brgy)) return 'District 2'
    }
    return 'VALENZUELA CITY'
  }

  // 3. Keyword-based matching for Bulacan
  if (addrLower.includes('bulacan')) {
    if (
      addrLower.includes('san miguel') ||
      addrLower.includes('san ildefonso') ||
      addrLower.includes('san rafael') ||
      addrLower.includes('dona remedios trinidad') ||
      addrLower.includes('drt')
    ) {
      return 'District 3'
    }
    if (
      addrLower.includes('malolos') ||
      addrLower.includes('bulakan') ||
      addrLower.includes('calumpit') ||
      addrLower.includes('hagonoy') ||
      addrLower.includes('paombong') ||
      addrLower.includes('pulilan')
    ) {
      return 'District 1'
    }
    if (addrLower.includes('baliuag') || addrLower.includes('bustos') || addrLower.includes('plaridel')) {
      return 'District 2'
    }
    if (addrLower.includes('meycauayan') || addrLower.includes('marilao') || addrLower.includes('obando')) {
      return 'District 4'
    }
    if (addrLower.includes('guiguinto') || addrLower.includes('balagtas') || addrLower.includes('pandi') || addrLower.includes('bocaue')) {
      return 'District 5'
    }
    if (addrLower.includes('san jose del monte') || addrLower.includes('sjdm')) {
      return 'District 6'
    }
  }

  // 4. Check against our comprehensive dictionary of Philippine Cities / Municipalities
  const matchedTown = matchTownKey(addrLower)
  if (matchedTown) {
    return matchedTown
  }

  // 5. Match specific "... CITY" pattern: only capture the 1 or 2 words directly before "CITY"
  // Example: "266 JP RIZAL STREET STA. ELENA MARIKINA CITY" -> captures "MARIKINA CITY"
  const cityEndMatch = cleanAddr.match(/\b((?:(?:SAN|SANTA|STA\.?|STO\.?|SANTO|GENERAL|GEN\.?|TRECE|LOS|DEL|DE|LA|EL)\s+)?[A-Za-z]+)\s+City\b/i)
  if (cityEndMatch && cityEndMatch[1]) {
    const rawName = cityEndMatch[1].trim().replace(/\.+/g, '')
    const lowerName = rawName.toLowerCase()
    const nonCityPrefixes = new Set(['street', 'st', 'road', 'rd', 'ave', 'avenue', 'drive', 'dr', 'blvd', 'brgy', 'barangay', 'phase', 'lot', 'blk', 'block', 'purok', 'sitio', 'near'])
    if (!nonCityPrefixes.has(lowerName)) {
      return `${rawName.toUpperCase()} CITY`
    }
  }

  // 6. Last two words fallback (clean out postal code numbers, punctuation)
  const words = cleanAddr
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !/^\d+$/.test(w))

  const ignoredWords = new Set(['philippines', 'ph', 'phils', 'ncr', 'metro'])

  const filteredWords = words.filter(w => !ignoredWords.has(w.toLowerCase()))
  if (filteredWords.length >= 2) {
    const lastTwo = `${filteredWords[filteredWords.length - 2]} ${filteredWords[filteredWords.length - 1]}`.toUpperCase()
    return lastTwo
  } else if (filteredWords.length === 1) {
    return filteredWords[0].toUpperCase()
  }

  return ''
}
