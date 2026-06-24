function cleanEnvValue(value?: string): string {
  const trimmed = value?.trim() || ''

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }

  return trimmed
}

export function getBlueButtonCredentials() {
  const clientId = cleanEnvValue(process.env.BB_CLIENT_ID)
  const clientSecret = cleanEnvValue(process.env.BB_CLIENT_SECRET)

  return {
    clientId,
    clientSecret,
    hasCredentials: Boolean(clientId && clientSecret),
  }
}

export function createBasicAuthHeader(clientId: string, clientSecret: string): string {
  const encodedClientId = encodeURIComponent(clientId)
  const encodedClientSecret = encodeURIComponent(clientSecret)
  return `Basic ${Buffer.from(`${encodedClientId}:${encodedClientSecret}`).toString('base64')}`
}
