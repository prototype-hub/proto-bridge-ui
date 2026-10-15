/** Copy from a user gesture, including HTTP deployments where Clipboard API is unavailable. */
export async function writeClipboard(text: string, context?: HTMLElement): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // A browser permission rejection can still allow the user-initiated legacy copy command.
  }
  return copyWithSelection(text, context)
}

/** Keep the temporary selection inside the modal focus boundary and restore the user's focus. */
function copyWithSelection(text: string, context?: HTMLElement): boolean {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
  const selection = document.getSelection()
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) =>
        selection.getRangeAt(index).cloneRange(),
      )
    : []
  const field =
    active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : undefined
  const fieldSelection =
    field && field.selectionStart !== null
      ? {
          start: field.selectionStart,
          end: field.selectionEnd,
          direction: field.selectionDirection,
        }
      : undefined
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.readOnly = true
  textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;'
  const container =
    context?.closest('[role="dialog"]') || active?.closest('[role="dialog"]') || document.body
  try {
    container.append(textarea)
    textarea.focus({ preventScroll: true })
    textarea.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
    if (active?.isConnected) active.focus({ preventScroll: true })
    if (field?.isConnected && fieldSelection)
      field.setSelectionRange(
        fieldSelection.start,
        fieldSelection.end,
        fieldSelection.direction || undefined,
      )
    if (selection) {
      selection.removeAllRanges()
      ranges.forEach((range) => selection.addRange(range))
    }
  }
}
