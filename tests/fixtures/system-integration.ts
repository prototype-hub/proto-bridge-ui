export function integrationResponse(
  path: string,
  _method: string,
  _input: unknown,
  send: (result: unknown) => void,
): boolean {
  if (path === '/application/sso/me/bindings') send([])
  else if (path.startsWith('/application/sso/')) send({ name: 'SSO应用' })
  else if (path === '/menu/iot/_all') send(true)
  else if (
    path === '/organization/org1/users/_bind' ||
    path === '/organization/org1/users/_unbind' ||
    (path.includes('/position/') && path.includes('/users/'))
  )
    send(true)
  else return false
  return true
}
