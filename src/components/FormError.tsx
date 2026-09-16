/**
 * A form's error message. Not just styling: `role="alert"` is what makes a
 * screen reader announce the failure, which otherwise appears silently
 * below a button the user has already stopped looking at.
 *
 * Give it an `id` and point the offending field's `aria-describedby` at it
 * so the message is read out when focus lands back on the field.
 */
export default function FormError({ id, children }: { id?: string; children: React.ReactNode }) {
  if (!children) return null
  return (
    <p id={id} role="alert" className="text-sm text-red-600 dark:text-red-400">
      {children}
    </p>
  )
}
