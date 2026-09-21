import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Toolbar from '../Toolbar'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The search field takes a filter OR a question, and neither has to be chosen
// first. Asking in words used to need a ✨ button at the field's right end,
// which nobody pressed: the hint panel opens on focus and, showing operators
// alone, said that operators were the whole field. Now the panel offers the
// question first and `Enter` sends it — there is no mode to arm, and what
// `aiSearch` means is that an ANSWER is on screen.

function render(props: Record<string, any> = {}) {
  installMockGitAPI()
  const all: Record<string, any> = {
    repoPath: '/repo', currentBranch: 'main', searchQuery: '', pullMode: 'ff', loading: false,
    onSearch: jest.fn(), onUndo: jest.fn(), onRedo: jest.fn(), onFetch: jest.fn(),
    onPush: jest.fn(), onPushModal: jest.fn(), onPull: jest.fn(), onSetPullMode: jest.fn(),
    onCreateBranch: jest.fn(), onRefresh: jest.fn(),
    ...props,
  }
  renderWithProviders(<Toolbar {...(all as any)} />)
  return all
}
const field = () => screen.getByPlaceholderText(/Search commits/i)

test('the placeholder names both ways in, and no emoji is drawn to reach either', () => {
  render({ onAskAi: jest.fn() })
  expect(field()).toHaveAttribute('placeholder', 'Search commits, or ask a question…')
  expect(document.querySelector('.tb-search')!.textContent).not.toMatch(/[✨\u{1F300}-\u{1FAFF}]/u)
})

test('Enter over a sentence asks the model', async () => {
  const onAskAi = jest.fn()
  render({ searchQuery: 'the commits that broke the build', onAskAi })
  await userEvent.click(field())
  await userEvent.keyboard('{Enter}')
  expect(onAskAi).toHaveBeenCalledTimes(1)
})

test('Enter over operators alone asks nothing — that filter is already live', async () => {
  const onAskAi = jest.fn()
  render({ searchQuery: 'author:ana after:2w', onAskAi })
  await userEvent.click(field())
  await userEvent.keyboard('{Enter}')
  expect(onAskAi).not.toHaveBeenCalled()
})

test('a host without the search asks nothing on Enter', async () => {
  render({ searchQuery: 'what broke the build' })
  await userEvent.click(field())
  await userEvent.keyboard('{Enter}')
  expect(document.querySelector('.shint-ask')).toBeNull()
})

test('the model answering is said in the field as a state, not as a button to press', () => {
  render({ searchQuery: 'what broke the build', onAskAi: jest.fn(), aiSearch: true })
  const mark = document.querySelector('.tb-search-ai')!
  expect(mark.tagName).toBe('SPAN')
  expect(document.querySelector('.tb-search')).toHaveClass('tb-search--ai')
  expect(screen.getByTitle(/the model's answer/i)).toBeInTheDocument()
})

test('while it is being asked, the field says so even when the panel is not open', () => {
  render({ searchQuery: 'what broke the build', onAskAi: jest.fn(), aiSearchLoading: true })
  expect(document.querySelector('.tb-search-ai')).toHaveTextContent('…')
  expect(screen.getAllByTitle('Asking the model…').length).toBeGreaterThan(0)
})
