export interface ScannedPackageRef {
  raw: string
  packageId?: number
  nomenclatureCode?: string
  batchNumber?: string
  expiryDate?: string // ГГММДД
}

/** Разбор содержимого DataMatrix формата (01)...(10)...(15)...(21)...
 *  Также принимает голый числовой ID упаковки: "2", "00002", "PKG-00002". */
export function parseDatamatrix(raw: string): ScannedPackageRef {
  const ref: ScannedPackageRef = { raw }
  const t = raw.trim()

  // Голый ID упаковки: 1–6 цифр, с ведущими нулями или без, опционально с префиксом PKG-
  const idMatch = t.match(/^(?:PKG-)?(\d{1,6})$/i)
  if (idMatch) {
    ref.packageId = parseInt(idMatch[1], 10)
    return ref
  }

  const m01 = t.match(/\(01\)(\d{8,14})/)
  if (m01) ref.nomenclatureCode = m01[1]
  const m10 = t.match(/\(10\)([^(]+)/)
  if (m10) ref.batchNumber = m10[1]
  const m15 = t.match(/\(15\)(\d{6})/)
  if (m15) ref.expiryDate = m15[1]
  const m21 = t.match(/\(21\)(\d{1,6})/)
  if (m21) ref.packageId = parseInt(m21[1], 10)
  return ref
}

/** QR места хранения имеет формат LOC:<адрес> */
export function parseLocationQr(raw: string): string | null {
  const t = raw.trim()
  return t.startsWith('LOC:') ? t.slice(4) : null
}