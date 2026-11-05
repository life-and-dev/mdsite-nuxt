import { describe, expect, it } from 'vitest'
import { useTableParser } from './useTableParser'

function createTable(titles: string[], rows: string[][]): HTMLTableElement {
  const headerRow = {
    querySelectorAll: () => titles.map(textContent => ({ textContent }))
  }
  const thead = { querySelector: () => headerRow }
  const tbody = {
    querySelectorAll: () => rows.map(row => ({
      querySelectorAll: () => row.map(textContent => ({
        textContent,
        querySelector: () => null
      }))
    }))
  }

  return {
    querySelector: (selector: string) => selector === 'thead' ? thead : tbody
  } as unknown as HTMLTableElement
}

describe('useTableParser', () => {
  it('preserves independent row values for repeated header titles', () => {
    const table = createTable(
      ['Verse', 'Verse', 'Verse'],
      [['first', 'second', 'third'], ['fourth', 'fifth', 'sixth']]
    )

    const { headers, items } = useTableParser().parseTable(table)

    expect(headers.map(header => header.title)).toEqual(['Verse', 'Verse', 'Verse'])
    expect(headers.map(header => header.key)).toEqual(['verse', 'verse-2', 'verse-3'])
    expect(items).toEqual([
      { verse: 'first', 'verse-2': 'second', 'verse-3': 'third' },
      { verse: 'fourth', 'verse-2': 'fifth', 'verse-3': 'sixth' }
    ])
  })

  it('avoids normalized and generated key collisions without changing other keys', () => {
    const table = createTable(
      ['Verse!', 'verse', 'Verse-2', 'VERSE', '!!!', 'Col 4'],
      [['one', 'two', 'three', 'four', 'five', 'six']]
    )

    const { headers, items } = useTableParser().parseTable(table)

    expect(headers.map(header => header.title)).toEqual(['Verse!', 'verse', 'Verse-2', 'VERSE', '!!!', 'Col 4'])
    expect(headers.map(header => header.key)).toEqual(['verse', 'verse-3', 'verse-2', 'verse-4', 'col-4', 'col-4-2'])
    expect(items).toEqual([{
      verse: 'one',
      'verse-3': 'two',
      'verse-2': 'three',
      'verse-4': 'four',
      'col-4': 'five',
      'col-4-2': 'six'
    }])
  })
})
