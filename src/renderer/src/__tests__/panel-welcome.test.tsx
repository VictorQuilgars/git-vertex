import { render, screen, fireEvent } from '@testing-library/react'
import { LanguageProvider } from '../i18n/LanguageContext'
import WelcomeTab from '../../../../vscode-extension/src/webview/WelcomeTab'

// The page a fresh install opens: six things to try, each with a gesture the
// host runs by name from its allow-list. An extension component tested from
// the desktop suite, like the rail and the toolbar: jest is the harness with
// a DOM.

const draw = () => render(<LanguageProvider><WelcomeTab /></LanguageProvider>)

describe('the welcome page', () => {
  beforeEach(() => { (window as any).gitAPI = { workbench: jest.fn().mockResolvedValue({}) } })

  test('offers six things to try', () => {
    draw()
    expect(screen.getAllByRole('region')).toHaveLength(6)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/welcome to git vertex/i)
  })

  test('a gesture runs the command by name, through the host', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: /move to the side bar/i }))
    expect((window as any).gitAPI.workbench).toHaveBeenCalledWith('gitVertex.moveToSideBar')
    fireEvent.click(screen.getByRole('button', { name: /what’s new/i }))
    expect((window as any).gitAPI.workbench).toHaveBeenCalledWith('gitVertex.showWhatsNew')
  })
})
