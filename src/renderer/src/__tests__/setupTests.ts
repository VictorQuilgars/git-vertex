import '@testing-library/jest-dom'

// jsdom ships no ResizeObserver; components that measure themselves to pick a
// compact layout (RightPanel) construct one on mount and would otherwise throw.
if (!(global as any).ResizeObserver) {
  ;(global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
