/**
 * Tiny user-agent describer for Settings → Active sessions ("Chrome on Windows").
 *
 * Deliberately small: it recognises the mainstream browsers and operating systems and falls back
 * to "Unknown device". It is a label for humans, never an input to security decisions.
 */
export type DeviceKind = 'desktop' | 'mobile' | 'tablet'

export interface DeviceDescription {
  browser: string | null
  os: string | null
  kind: DeviceKind
  /** "Chrome on Windows", "Safari on iOS", "Firefox", "Unknown device". */
  label: string
}

// Order matters: Edge/Opera/Samsung UAs also contain "Chrome" and "Safari"; Chrome UAs contain "Safari".
const BROWSERS: Array<[RegExp, string]> = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bOPR\/|\bOpera\b/, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\bFirefox\/|\bFxiOS\//, 'Firefox'],
  [/\bCriOS\/|\bChrome\/|\bChromium\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\/|\bMobile\/\w+\s+Safari\//, 'Safari'],
]

// Order matters: iPad/iPhone UAs contain "Mac OS X"; Android UAs contain "Linux".
const SYSTEMS: Array<[RegExp, string]> = [
  [/\biPad\b/, 'iPadOS'],
  [/\biPhone\b|\biPod\b/, 'iOS'],
  [/\bAndroid\b/, 'Android'],
  [/\bWindows\b/, 'Windows'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bMacintosh\b|\bMac OS X\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
]

function match(table: Array<[RegExp, string]>, userAgent: string) {
  return table.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null
}

function deviceKind(userAgent: string): DeviceKind {
  if (/\biPad\b|\bTablet\b/.test(userAgent)) return 'tablet'
  if (/\bAndroid\b/.test(userAgent) && !/\bMobile\b/.test(userAgent)) return 'tablet'
  if (/\bMobi|\biPhone\b|\biPod\b|\bAndroid\b/.test(userAgent)) return 'mobile'
  return 'desktop'
}

export function describeUserAgent(userAgent?: string | null): DeviceDescription {
  const ua = (userAgent ?? '').trim()
  if (!ua) return { browser: null, os: null, kind: 'desktop', label: 'Unknown device' }
  const browser = match(BROWSERS, ua)
  const os = match(SYSTEMS, ua)
  const label = browser && os ? `${browser} on ${os}` : (browser ?? os ?? 'Unknown device')
  return { browser, os, kind: deviceKind(ua), label }
}
