import { useState } from 'react'
import { Alert, Button, Stack, TextField } from '@mui/material'
import type { PackageInfo } from '../api/types'
import { fractionAmount } from '../utils/amount'

interface Props {
  pkg: PackageInfo
  onPick: (amount: string | null) => void
  freeLabel?: string
  disabled?: boolean
}

export default function AmountPicker({ pkg, onPick, freeLabel = 'Continue without amount', disabled }: Props) {
  const [custom, setCustom] = useState('')
  const mode = pkg.tracking_mode

  if (mode === 'free') {
    return (
      <Stack spacing={1.5}>
        <Alert severity="info">This item is tracked freely — no amount is required.</Alert>
        <Button variant="outlined" size="large" disabled={disabled} onClick={() => onPick(null)}>
          {freeLabel}
        </Button>
      </Stack>
    )
  }

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {mode === 'per_unit' && [1, 5, 10].map((n) => (
          <Button key={n} size="large" variant="contained" disabled={disabled} onClick={() => onPick(String(n))}>
            {n} pcs
          </Button>
        ))}
        {mode === 'by_measure' &&
          ([['~1/4', 0.25], ['~1/2', 0.5], ['~3/4', 0.75]] as const).map(([label, frac]) => {
            const val = fractionAmount(pkg.nominal_amount, frac)
            return (
              <Button key={label} size="large" variant="contained" disabled={disabled || val == null}
                      onClick={() => onPick(String(val))}>
                {label}
              </Button>
            )
          })}
      </Stack>
      <Stack direction="row" spacing={1}>
        <TextField
          size="small" type="number" fullWidth
          label={mode === 'per_unit' ? 'Other quantity, pcs' : `Amount, ${pkg.unit ?? ''}`}
          value={custom} onChange={(e) => setCustom(e.target.value)}
        />
        <Button variant="outlined" disabled={disabled || !custom} onClick={() => onPick(custom)}>OK</Button>
      </Stack>
    </Stack>
  )
}