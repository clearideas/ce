import { vi } from 'vitest'

// ---- Browser API polyfills that jsdom lacks and Vuetify / the app touch on mount -----------

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

Object.defineProperty(window, 'ResizeObserver', { writable: true, value: ObserverStub })
Object.defineProperty(window, 'IntersectionObserver', { writable: true, value: ObserverStub })

if (!('visualViewport' in window)) {
  Object.defineProperty(window, 'visualViewport', {
    writable: true,
    value: {
      width: 1280,
      height: 800,
      scale: 1,
      offsetLeft: 0,
      offsetTop: 0,
      addEventListener() {},
      removeEventListener() {},
    },
  })
}

if (typeof window.CSS === 'undefined') {
  Object.defineProperty(window, 'CSS', {
    writable: true,
    value: { supports: () => false, escape: (v: string) => v },
  })
}

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
if (!HTMLCanvasElement.prototype.getContext) {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext']
}

// Vuetify reads layout sizes; give jsdom a desktop-sized window by default.
Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1280 })
Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 800 })
