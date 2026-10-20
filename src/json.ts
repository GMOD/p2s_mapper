export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : []
}

/** A quoted GraphQL string, so an id holding `"` cannot end the literal.
 * GraphQL accepts every escape `JSON.stringify` writes. */
export function graphqlString(value: string) {
  return JSON.stringify(value)
}
