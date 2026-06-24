const TOKEN_TTL_MS = 5 * 60 * 1000 // 5 minutes
const bundleTokens = new Map<string, number>() // key: `${shlId}:${token}`, value: expiry

export function issueToken(shlId: string, token: string): void {
  bundleTokens.set(`${shlId}:${token}`, Date.now() + TOKEN_TTL_MS)
}

export function validateToken(shlId: string, token: string): boolean {
  const key = `${shlId}:${token}`
  const expiry = bundleTokens.get(key)
  if (!expiry || Date.now() > expiry) {
    bundleTokens.delete(key)
    return false
  }
  bundleTokens.delete(key) // one-time use — token is gone after first valid use
  return true
}
