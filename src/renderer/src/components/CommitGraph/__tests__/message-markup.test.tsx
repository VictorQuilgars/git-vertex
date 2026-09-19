import { render } from '@testing-library/react'
import { inlineMarkup } from '../message-markup'

// A commit message's light markup, drawn in a graph row: `code`, **bold**,
// *italic* — and a delimiter that does not form a run left as it was written.
const html = (message: string) => render(<span>{inlineMarkup(message)}</span>).container.innerHTML

describe('inlineMarkup', () => {
  test('code, bold and italic runs', () => {
    expect(html('the `/` key, **once**, *twice*, _thrice_'))
      .toBe('<span>the <code class="cg-msg-code">/</code> key, <strong>once</strong>, <em>twice</em>, <em>thrice</em></span>')
  })

  test('a lone or spaced delimiter is text', () => {
    expect(html('3 * 4 and a * b')).toBe('<span>3 * 4 and a * b</span>')
    expect(html('snake_case_name stays')).toBe('<span>snake_case_name stays</span>')
  })

  test('the text between the runs goes through the caller — where issue links are made', () => {
    const seen: string[] = []
    render(<span>{inlineMarkup('fix `a` in b', s => { seen.push(s); return s })}</span>)
    expect(seen).toEqual(['fix ', ' in b'])
  })
})
