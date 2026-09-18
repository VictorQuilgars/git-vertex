import { render, screen, fireEvent } from '@testing-library/react'
import { LanguageProvider } from '../../../i18n/LanguageContext'
import ActivityChart from '../ActivityChart'

// The chart draws one bar per bucket and hands a clicked bar's commits over.

const now = new Date(2026, 8, 18, 15).getTime()
const at = (d: number) => Math.floor(new Date(2026, 8, d, 12).getTime() / 1000)

test('one bar per bucket, a legend of authors, and a click that yields the commits', () => {
  const onPick = jest.fn()
  render(<LanguageProvider>
    <ActivityChart period="day" now={now} onPick={onPick}
      points={[{ at: at(18), author: 'Alice', hash: 'a1' }, { at: at(18), author: 'Bob', hash: 'b1' }, { at: at(3), author: 'Alice', hash: 'a2' }]} />
  </LanguageProvider>)
  expect(document.querySelectorAll('.ac-bar')).toHaveLength(60)
  expect(screen.getByText('Alice')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /sep 18: 2 commits/i }))
  expect(onPick).toHaveBeenCalledTimes(1)
  expect(onPick.mock.calls[0][0].hashes).toEqual(['a1', 'b1'])
})

test('no commits in the window is said, not drawn', () => {
  render(<LanguageProvider><ActivityChart period="week" now={now} points={[]} /></LanguageProvider>)
  expect(document.querySelector('.ac-svg')).toBeNull()
  expect(screen.getByText(/no commits/i)).toBeInTheDocument()
})
