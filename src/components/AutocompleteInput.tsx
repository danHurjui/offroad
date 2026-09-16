'use client'

import { useId } from 'react'

/**
 * A text input backed by a native `<datalist>`.
 *
 * Native rather than a JS combobox on purpose: it is keyboard- and
 * screen-reader-accessible for free, needs no popup positioning on a phone,
 * and — crucially — the value stays free text. Every field this is used on
 * accepts anything (an ARO 243 owner must not be forced to pick a Dacia),
 * so the list is a shortcut, never a constraint. Nothing server-side
 * validates against it.
 */
export default function AutocompleteInput({
  id,
  value,
  onChange,
  suggestions,
  className = 'input',
  ...rest
}: {
  id: string
  value: string
  onChange: (value: string) => void
  suggestions: readonly string[]
  className?: string
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id' | 'value' | 'onChange' | 'list' | 'className'>) {
  // The list id has to be unique per render, not per field name — the same
  // form can appear twice on a page (edit dialogs), and a duplicate id
  // silently points both inputs at whichever datalist parsed first.
  const listId = `${id}-${useId()}`

  return (
    <>
      <input
        id={id}
        name={id}
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={suggestions.length > 0 ? listId : undefined}
        // Browser autofill guesses badly at vehicle/part fields and will
        // happily drop a street address into "Make". The datalist is the
        // suggestion source here, not the autofill store.
        autoComplete="off"
        {...rest}
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </>
  )
}
