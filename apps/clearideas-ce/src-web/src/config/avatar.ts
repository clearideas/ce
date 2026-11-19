/**
 * Avatar background colours, picked by hashing the user's identity. Every entry's `on-*` colour
 * reaches 4.5:1 in both themes (the initials are text) — test/web/theme-contrast.test.ts checks it.
 * (`feature` and `success` were dropped: white initials on them measured 3.3:1 and 3.1:1.)
 */
export const AVATAR_COLORS = ['primary', 'accent-2', 'accent-3', 'accent-1', 'ai-tools'] as const

/** Up to two initials from the name (first letters of the first two words), else the email's first letter. */
export function avatarInitials(name?: string | null, email?: string | null): string {
  const trimmed = name?.trim()
  if (trimmed)
    return trimmed
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part[0])
      .join('')
      .toUpperCase()
  return (email?.[0] ?? '?').toUpperCase()
}
