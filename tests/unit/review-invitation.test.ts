import { expect, it } from 'vitest'
import {
  parseReviewInvitation,
  reviewInvitationUrl,
} from '@/modules/protohub-manager-ui/utils/review-invitation'
const invitation = 'A'.repeat(43)
it.each(['/tools/share/open', '/tools/#/share/open'])(
  'keeps invitation credentials in fragment without replacing the route (%s)',
  (href) => {
    const url = reviewInvitationUrl({ resolve: () => ({ href }) } as never, 'open', invitation)
    expect(url).toBe(`${window.location.origin}${href}#reviewInvitation=${invitation}`)
    expect(new URL(url).search).toBe('')
    const migrated = href.includes('#/')
      ? new URL(url).hash.slice(1)
      : new URL(url).pathname + new URL(url).hash
    expect(migrated).toContain(`/share/open#reviewInvitation=${invitation}`)
  },
)
it('encodes only the share path and never puts an invitation token in a route query', () => {
  let path = ''
  reviewInvitationUrl(
    {
      resolve: (value: string) => {
        path = value
        return { href: `/tools${value}` }
      },
    } as never,
    'share/id',
    invitation,
  )
  expect(path).toBe('/share/share%2Fid')
  expect(parseReviewInvitation(`#reviewInvitation=${invitation}`)).toBe(invitation)
})
it.each([
  '#reviewInvitation',
  '#reviewInvitation=',
  '#reviewInvitation=short',
  `#reviewInvitation=${invitation}&reviewInvitation=${invitation}`,
  `#reviewInvitation=${invitation}&other=x`,
  `#reviewInvitation=${'A'.repeat(42)}%41`,
])('preserves explicit invalid intent for %s', (hash) => {
  expect(parseReviewInvitation(hash)).toBeNull()
})
it.each(['', '#unrelated', '#/share/open'])('does not invent an invitation for %s', (hash) => {
  expect(parseReviewInvitation(hash)).toBeUndefined()
})
it('rejects an invalid server token instead of building a credential-bearing malformed link', () => {
  expect(() =>
    reviewInvitationUrl({ resolve: () => ({ href: '/share/open' }) } as never, 'open', 'bad#token'),
  ).toThrow('Invalid invitation token')
})
