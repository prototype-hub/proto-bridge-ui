import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { message } from 'ant-design-vue'
import { writeClipboard } from '@/shared/utils/clipboard'
import { copyText } from '@/shared/utils/feedback'

vi.mock('ant-design-vue', () => ({ message: { success: vi.fn(), error: vi.fn() } }))
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
const originalCommand = Object.getOwnPropertyDescriptor(document, 'execCommand')
const command = vi.fn<(command: string) => boolean>()
const url = 'http://192.0.2.10:10008/tools/share/中文-token'
function clipboard(value?: { writeText: (text: string) => Promise<void> }) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value })
}
beforeEach(() => {
  clipboard()
  command.mockReset().mockReturnValue(true)
  Object.defineProperty(document, 'execCommand', { configurable: true, value: command })
})
afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else Reflect.deleteProperty(navigator, 'clipboard')
  if (originalCommand) Object.defineProperty(document, 'execCommand', originalCommand)
  else Reflect.deleteProperty(document, 'execCommand')
  document.body.innerHTML = ''
  document.getSelection()?.removeAllRanges()
})

it('prefers the native API without changing focus or creating a selection', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  clipboard({ writeText })
  expect(await writeClipboard(url)).toBe(true)
  expect(writeText).toHaveBeenCalledWith(url)
  expect(command).not.toHaveBeenCalled()
  expect(document.querySelector('textarea')).toBeNull()
})

it('copies synchronously inside the dialog on HTTP and restores input focus and selection', async () => {
  document.body.innerHTML = '<div role="dialog"><input value="original input"></div>'
  const dialog = document.querySelector('[role="dialog"]')!
  const input = document.querySelector('input')!
  input.focus()
  input.setSelectionRange(2, 8, 'backward')
  command.mockImplementation(() => {
    const selected = document.activeElement as HTMLTextAreaElement
    expect(selected.tagName).toBe('TEXTAREA')
    expect(selected.closest('[role="dialog"]')).toBe(dialog)
    expect(selected.value).toBe(url)
    expect(selected.selectionEnd).toBe(url.length)
    return true
  })
  const result = writeClipboard(url)
  // No initial await when native API is absent: preserve the click's transient activation.
  expect(command).toHaveBeenCalledWith('copy')
  expect(await result).toBe(true)
  expect(document.activeElement).toBe(input)
  expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([
    2,
    8,
    'backward',
  ])
  expect(document.querySelector('textarea')).toBeNull()
})

it('falls back after native rejection using the captured dialog even if focus moved', async () => {
  document.body.innerHTML = '<div role="dialog"><button>Copy</button></div><input id="outside">'
  const button = document.querySelector('button')!
  const outside = document.querySelector<HTMLInputElement>('#outside')!
  clipboard({
    writeText: async () => {
      outside.focus()
      throw new Error('Permission denied')
    },
  })
  command.mockImplementation(() => {
    expect(document.activeElement?.closest('[role="dialog"]')).toBe(
      button.closest('[role="dialog"]'),
    )
    return true
  })
  expect(await writeClipboard(url, button)).toBe(true)
  expect(document.activeElement).toBe(outside)
  expect(document.querySelector('textarea')).toBeNull()
})

it('restores a document text selection after copying', async () => {
  document.body.innerHTML = '<p>Existing selected text</p>'
  const range = document.createRange()
  range.selectNodeContents(document.querySelector('p')!)
  document.getSelection()!.addRange(range)
  expect(await writeClipboard(url)).toBe(true)
  expect(document.getSelection()!.toString()).toBe('Existing selected text')
})

it.each(['false', 'throw'])(
  'cleans up and reports failure when legacy copy returns %s',
  async (failure) => {
    document.body.innerHTML = '<button>Copy</button>'
    const button = document.querySelector('button')!
    button.focus()
    command.mockImplementation(() => {
      if (failure === 'throw') throw new Error('Unsupported')
      return false
    })
    expect(await writeClipboard(url, button)).toBe(false)
    expect(document.activeElement).toBe(button)
    expect(document.querySelector('textarea')).toBeNull()
  },
)

it('shows success after fallback and shows an error only when both mechanisms fail', async () => {
  clipboard({ writeText: vi.fn().mockRejectedValue(new Error('Denied')) })
  expect(await copyText(url)).toBe(true)
  expect(message.success).toHaveBeenCalledTimes(1)
  expect(message.error).not.toHaveBeenCalled()
  command.mockReturnValue(false)
  expect(await copyText(url)).toBe(false)
  expect(message.success).toHaveBeenCalledTimes(1)
  expect(message.error).toHaveBeenCalledTimes(1)
})
