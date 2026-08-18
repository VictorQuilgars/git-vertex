import { render, screen } from '@testing-library/react'
import { LanguageProvider } from '../i18n/LanguageContext'
import ActivityRail from '../../../../vscode-extension/src/webview/ActivityRail'

// Two crash sites, both shipped, both of the same shape: a component calling a
// name that is not in scope. TypeScript would have said so — nothing type-checks
// the panel's webview, and until this branch the shared renderer was 1049 errors
// deep behind one bad `t()` signature, so nobody could have read the answer.
//
// The rail is an *extension* component tested from the desktop suite on purpose:
// jest is the only harness here with a DOM. The extension's own suite runs
// display-free, which is why it never rendered this.
//
// `I is not defined` — ActivityRail called a helper deleted in the icon refactor,
// on the one button the refactor did not touch. It only renders when the rail
// overflows, so it took a short panel to see it. jsdom reports every height as 0,
// so the overflow path is the default here — which is exactly what we want.

const rail = () => render(
  <LanguageProvider>
    <ActivityRail active={null} onSelect={() => {}} />
  </LanguageProvider>
)

describe('the panel chrome renders at all', () => {
  test('the activity rail survives having to overflow', () => {
    expect(() => rail()).not.toThrow()
  })

  test('and offers the overflow menu button when it does', () => {
    rail()
    expect(screen.getByRole('button', { name: /more/i })).toBeInTheDocument()
  })

  test('the board placeholder is there and disabled', () => {
    rail()
    expect(screen.getByRole('button', { name: /board/i })).toBeDisabled()
  })
})
