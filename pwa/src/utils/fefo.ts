export function sortByFefo<T extends { expiry_date: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (!a.expiry_date && !b.expiry_date) return 0
    if (!a.expiry_date) return 1
    if (!b.expiry_date) return -1
    return a.expiry_date.localeCompare(b.expiry_date)
  })
}

export function isExpired(p: { expiry_date: string | null }): boolean {
  if (!p.expiry_date) return false
  return new Date(`${p.expiry_date}T23:59:59`) < new Date()
}

export function daysUntilExpiry(p: { expiry_date: string | null }): number | null {
  if (!p.expiry_date) return null
  return Math.ceil((new Date(`${p.expiry_date}T00:00:00`).getTime() - Date.now()) / 86400000)
}