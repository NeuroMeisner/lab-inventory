export interface User {
  id: number
  google_email: string | null
  telegram_id: number | null
  full_name: string | null
  role: 'admin' | 'user'
  default_grant_id: number | null
  is_active: boolean
  accounts_linked: boolean
  created_at: string
}

export interface TokenPair {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface Nomenclature {
  id: number
  name: string
  synonyms: string[] | null
  cas_number: string | null
  unit: string
  category: string
  tracking_mode: 'free' | 'per_unit' | 'by_measure'
  storage_temp: string | null
  min_stock: number
  is_hazardous: boolean
  sds_link: string | null
  manufacturer_code: string | null
  nomenclature_code: string
  created_at: string
}

export interface PackageInfo {
  id: number
  display_code: string
  nomenclature_id: number
  nomenclature_name: string | null
  unit: string | null
  category: string | null
  tracking_mode: string | null
  batch_number: string | null
  nominal_amount: number | null
  current_amount: number | null
  expiry_date: string | null
  zone: string
  location: string | null
  placement_status: 'pending' | 'placed'
  opened_at: string | null
  grant_id: number | null
  grant_code: string | null
  grant_manager: string | null
  datamatrix_code: string
  label_printed: boolean
  reserved_by_id: number | null
  reserved_by_name: string | null
  reserved_until: string | null
  created_by_id: number | null
  created_at: string
  updated_at: string
}

export interface PackageDetail extends PackageInfo {
  nomenclature: Nomenclature | null
  opened_by_name: string | null
}

export interface TransactionInfo {
  id: number
  package_id: number
  package_code: string
  user_id: number | null
  user_name: string | null
  grant_id: number | null
  type: string
  amount: number | null
  from_location: string | null
  to_location: string | null
  timestamp: string
  comment: string | null
}

export interface Grant {
  id: number
  code: string
  manager_name: string
  expiry_date: string | null
  is_active: boolean
}

export interface PurchaseOrder {
  id: number
  nomenclature_id: number | null
  nomenclature_name: string | null
  name_temp: string | null
  expected_quantity: number | null
  expected_date: string | null
  supplier: string | null
  invoice_number: string | null
  grant_id: number | null
  grant_code: string | null
  status: 'ordered' | 'received' | 'cancelled'
  created_by_id: number | null
  created_by_name: string | null
  created_at: string
}

export interface SearchResult {
  id: number
  name: string
  synonyms: string[] | null
  cas_number: string | null
  unit: string
  category: string
  tracking_mode: string
  storage_temp: string | null
  nomenclature_code: string
  packages_available: number
  total_amount: number
}

export interface FrequentItem {
  nomenclature_id: number
  name: string
  unit: string
  uses: number
}

export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}