import { render } from '@testing-library/react'
import { createRef } from 'react'
import PanelDrawer from '../PanelDrawer'

// The drawer is a card of the frame: one --pane-gap right of the card it comes
// out of, on that card's top and bottom, with the panes' radius and edge — read
// from the ANCHOR, because the drawer renders in document.body and a short VS
// Code panel turns the frame flush on its own root only.

function anchorAt(box: { left: number; right: number; top: number; height: number }, frame?: Record<string, string>) {
  const el = document.createElement('div')
  for (const [k, v] of Object.entries(frame ?? {})) el.style.setProperty(k, v)
  el.getBoundingClientRect = () => ({
    ...box, width: box.right - box.left, bottom: box.top + box.height, x: box.left, y: box.top, toJSON: () => ({}),
  }) as DOMRect
  document.body.appendChild(el)
  const ref = createRef<HTMLElement>() as { current: HTMLElement | null }
  ref.current = el
  return ref
}

const drawer = () => document.querySelector('.pdrawer') as HTMLElement
const BLOCKS = { '--pane-gap': '8px', '--pane-radius': '8px', '--pane-edge': '0px' }

beforeEach(() => { document.body.innerHTML = ''; window.innerWidth = 1400 })

describe('where the drawer opens', () => {
  test('as a card: one gap right of its card, on its top and bottom, with its radius and edge', () => {
    const anchor = anchorAt({ left: 8, right: 308, top: 60, height: 700 }, BLOCKS)
    render(<PanelDrawer anchor={anchor} title="New filter" closeLabel="Close" onClose={() => {}}>form</PanelDrawer>)
    const d = drawer()
    expect(d.style.left).toBe('316px')
    expect(d.style.top).toBe('60px')
    expect(d.style.height).toBe('700px')
    expect(d.style.width).toBe('600px')
    expect(d.style.getPropertyValue('--pane-radius')).toBe('8px')
    expect(d.style.getPropertyValue('--pane-edge')).toBe('0px')
  })

  test('flush, it is against the panel with a line for an edge — the default frame', () => {
    const anchor = anchorAt({ left: 0, right: 300, top: 40, height: 700 })
    render(<PanelDrawer anchor={anchor} title="New filter" closeLabel="Close" onClose={() => {}}>form</PanelDrawer>)
    const d = drawer()
    expect(d.style.left).toBe('300px')
    expect(d.style.getPropertyValue('--pane-radius')).toBe('0px')
    expect(d.style.getPropertyValue('--pane-edge')).toBe('1px')
  })

  test('narrower than the window allows, it gives back what is left and keeps a margin', () => {
    window.innerWidth = 900
    const anchor = anchorAt({ left: 8, right: 308, top: 60, height: 700 }, BLOCKS)
    render(<PanelDrawer anchor={anchor} title="New filter" closeLabel="Close" onClose={() => {}}>form</PanelDrawer>)
    // 900 - 316 - 24
    expect(drawer().style.width).toBe('560px')
  })

  // A narrow panel's side view is a layer across the graph already: beside it
  // there is nothing, and the drawer used to open 240px wide off the window.
  test('with no room beside its card, it takes the card\'s place', () => {
    window.innerWidth = 520
    const anchor = anchorAt({ left: 60, right: 512, top: 60, height: 700 }, BLOCKS)
    render(<PanelDrawer anchor={anchor} title="New filter" closeLabel="Close" onClose={() => {}}>form</PanelDrawer>)
    const d = drawer()
    expect(d.style.left).toBe('60px')
    expect(d.style.width).toBe('452px')
  })
})
