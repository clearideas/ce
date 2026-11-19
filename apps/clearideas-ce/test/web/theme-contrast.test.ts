import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AVATAR_COLORS } from '../../src-web/src/config/avatar'
import theme from '../../src-web/src/plugins/vuetify/theme'

/**
 * WCAG 2 contrast for the colour pairs the UI relies on, computed from the theme source so the
 * numbers axe measures in the browser scans cannot drift silently. Opacity-blended pairs are
 * composited the way the browser does (fg over an opaque bg).
 */
type Rgb = [number, number, number]

function hex(value: string): Rgb {
  const v = value.replace('#', '')
  return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16)) as Rgb
}
function luminance([r, g, b]: Rgb) {
  const f = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
function blend(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as Rgb
}
export function contrast(fg: Rgb, bg: Rgb) {
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a)
  return (l1 + 0.05) / (l2 + 0.05)
}

const themes = theme.themes as Record<
  'light' | 'dark',
  { colors: Record<string, string>; variables: Record<string, string> }
>

describe.each(['light', 'dark'] as const)('%s theme contrast (WCAG AA)', name => {
  const { colors, variables } = themes[name]
  const surface = hex(colors.surface)
  const onSurface = hex(colors['on-surface'])
  const medium = Number(variables['medium-emphasis-opacity'])

  it('primary text on surface and on-primary text on primary fills are >= 4.5:1', () => {
    expect(contrast(hex(colors.primary), surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(hex(colors['on-primary']), hex(colors.primary))).toBeGreaterThanOrEqual(4.5)
  })

  it('semantic colours used as text are >= 4.5:1 on surface and background', () => {
    for (const name of ['primary', 'secondary', 'success', 'error', 'info']) {
      expect(contrast(hex(colors[name]), surface), `${name} on surface`).toBeGreaterThanOrEqual(4.5)
      expect(
        contrast(hex(colors[name]), hex(colors.background)),
        `${name} on background`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('text on every semantic fill (on-* over the colour: buttons, flat chips) is >= 4.5:1', () => {
    for (const name of ['primary', 'secondary', 'success', 'error', 'info', 'warning']) {
      expect(contrast(hex(colors[`on-${name}`]), hex(colors[name])), `on-${name}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('the favourite star (feature-secondary) meets the 3:1 non-text floor on surface and background', () => {
    expect(contrast(hex(colors['feature-secondary']), surface)).toBeGreaterThanOrEqual(3)
    expect(contrast(hex(colors['feature-secondary']), hex(colors.background))).toBeGreaterThanOrEqual(3)
  })

  it('avatar initials are >= 4.5:1 on every avatar colour', () => {
    for (const name of AVATAR_COLORS) {
      expect(contrast(hex(colors[`on-${name}`]), hex(colors[name])), `avatar ${name}`).toBeGreaterThanOrEqual(
        4.5,
      )
    }
  })

  it('footer text (on-surface at 0.68 over the page background) is >= 4.5:1 (plan 2.9)', () => {
    const background = hex(colors.background)
    expect(contrast(blend(onSurface, background, 0.68), background)).toBeGreaterThanOrEqual(4.5)
  })

  it('primary text on the page background (selected tab labels, links outside cards) is >= 4.5:1', () => {
    // The e2e axe scan flagged the selected BaseTabs label (primary on `background`) at 4.14:1
    // with the earlier #4D6BFE primary; this pins the fix.
    expect(contrast(hex(colors.primary), hex(colors.background))).toBeGreaterThanOrEqual(4.5)
  })

  it('medium-emphasis on-surface text (placeholders, hints) is >= 4.5:1 on surface and background', () => {
    expect(contrast(blend(onSurface, surface, medium), surface)).toBeGreaterThanOrEqual(4.5)
    const background = hex(colors.background)
    expect(contrast(blend(onSurface, background, medium), background)).toBeGreaterThanOrEqual(4.5)
  })

  it('data-table header labels (on-surface-variant over the header tint) are >= 4.5:1', () => {
    expect(
      contrast(hex(colors['on-surface-variant']), hex(variables['table-header-color'])),
    ).toBeGreaterThanOrEqual(4.5)
  })
})

describe('light theme tonal variants (chips/alerts draw the colour as text over its own ~12 % tint)', () => {
  const { colors } = themes.light
  const surface = hex(colors.surface)
  it.each(['primary', 'secondary', 'success', 'error', 'info'])(
    '%s text over its tonal tint is >= 4.5:1',
    name => {
      const fg = hex(colors[name])
      expect(contrast(fg, blend(fg, surface, 0.12))).toBeGreaterThanOrEqual(4.5)
    },
  )
})

describe('warning (amber) is a fill colour only', () => {
  const { colors } = themes.light
  const surface = hex(colors.surface)
  const warning = hex(colors.warning)

  it('fails as text over its own tint in the light theme (so tonal/outlined/text variants are banned)', () => {
    expect(contrast(warning, blend(warning, surface, 0.12))).toBeLessThan(4.5)
    expect(contrast(hex(colors['on-warning']), warning)).toBeGreaterThanOrEqual(4.5)
  })

  it('every color/type="warning" component in the source uses a filled variant', () => {
    // VChip and VAlert default to tonal (plugins/vuetify/defaults.ts), which draws amber text.
    const root = path.resolve(import.meta.dirname, '../../src-web/src')
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(file)
        else if (entry.name.endsWith('.vue')) {
          const source = fs.readFileSync(file, 'utf8')
          for (const [tag] of source.matchAll(/<V[A-Za-z]+\b[^>]*?\b(?:color|type)="warning"[^>]*>/g)) {
            if (!/\bvariant="(flat|elevated)"/.test(tag))
              offenders.push(`${path.relative(root, file)}: ${tag}`)
          }
        }
      }
    }
    walk(root)
    expect(offenders).toEqual([])
  })
})
