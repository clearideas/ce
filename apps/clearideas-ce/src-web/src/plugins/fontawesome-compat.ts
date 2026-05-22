export function normalizeFontAwesomeFreeIcon(icon: string | string[] | undefined): [string, string] {
  if (Array.isArray(icon)) return [normalizePrefix(icon[0]), icon[1]]

  const raw = String(icon ?? '')
  const parts = raw.split(/\s+/).filter(Boolean)
  const prefix = parts.find(part => /^(fa[srlbd]|fasl|fass|fasds|fak)$/.test(part)) ?? 'fas'
  const iconName = parts.find(part => part.startsWith('fa-'))?.replace(/^fa-/, '') ?? raw.replace(/^fa-/, '')
  return [normalizePrefix(prefix), normalizeIconName(iconName)]
}

function normalizePrefix(prefix: string) {
  if (['fasl', 'fass', 'fasds', 'fak'].includes(prefix)) return 'fas'
  if (prefix === 'far') return 'far'
  if (prefix === 'fab') return 'fab'
  return 'fas'
}

function normalizeIconName(iconName: string) {
  const aliases: Record<string, string> = {
    'spinner-third': 'spinner',
    'turn-down-left': 'check',
    escape: 'xmark',
    'arrow-long': 'angle-up',
    'delete-left': 'xmark',
    'mobile-notch': 'mobile-screen',
    'user-chart': 'chart-line',
    'file-chart-column': 'chart-simple',
    'building-shield': 'building',
    'microchip-ai': 'microchip',
    'comment-ai': 'comments',
    books: 'book-open',
    cog: 'gear',
    'sun-bright': 'sun',
    'moon-stars': 'moon',
  }
  return aliases[iconName] ?? iconName
}
