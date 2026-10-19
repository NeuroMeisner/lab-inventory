export interface ScannedPackageRef {
  raw: string
  packageId?: number
  nomenclatureCode?: string
  batchNumber?: string
  expiryDate?: string // ГГММДД
}

/** Разбор содержимого DataMatrix формата (01)...(10)...(15)...(21)... */
export function parseDatamatrix(raw: string): ScannedPackageRef {
  const ref: ScannedPackageRef = { raw }
  const m01 = raw.match(/\(01\)(\d{8,14})/)
  if (m01) ref.nomenclatureCode = m01[1]
  const m10 = raw.match(/\(10\)([^(]+)/)
  if (m10) ref.batchNumber = m10[1]
  const m15 = raw.match(/\(15\)(\d{6})/)
  if (m15) ref.expiryDate = m15[1]
  const m21 = raw.match(/\(21\)(\d{1,6})/)
  if (m21) ref.packageId = parseInt(m21[1], 10)
  return ref
}

/** QR места хранения имеет формат LOC:<адрес> */
export function parseLocationQr(raw: string): string | null {
  const t = raw.trim()
  return t.startsWith('LOC:') ? t.slice(4) : null
}