/** Доля от номинала для режима by_measure (~1/4, ~1/2, ~3/4). */
export function fractionAmount(nominal: number | null | undefined, fraction: number): number | null {
  if (!nominal) return null
  return Math.round(nominal * fraction * 1000) / 1000
}