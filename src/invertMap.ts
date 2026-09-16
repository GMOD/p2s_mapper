/** Swap keys and values of a numeric map, for reading a position map backwards. */
export function invertMap(arg: Record<number, number>): Record<number, number> {
  return Object.fromEntries(Object.entries(arg).map(([a, b]) => [b, +a]))
}
