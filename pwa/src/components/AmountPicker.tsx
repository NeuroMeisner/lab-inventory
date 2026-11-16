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
        <Button variant="contained" size="large" fullWidth disabled={disabled} onClick={() => onPick(null)}>
          {freeLabel}
        </Button>
      </Stack>
    )
  }

  const unit = pkg.unit ?? ''
  const isMeasure = mode === 'by_measure'

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {mode === 'per_unit' && [1, 5, 10].map((n) => (
          <Button
            key={n}
            size="large"
            variant="contained"
            disabled={disabled}
            onClick={() => onPick(String(n))}
            sx={{ flex: 1, minWidth: 84 }}
          >
            {n} pcs
          </Button>
        ))}
        {isMeasure &&
          ([['~1/4', 0.25], ['~1/2', 0.5], ['~3/4', 0.75]] as const).map(([label, frac]) => {
            const val = fractionAmount(pkg.nominal_amount, frac)
            return (
              <Button
                key={label}
                size="large"
                variant="contained"
                disabled={disabled || val == null}
                onClick={() => onPick(String(val))}
                sx={{ flex: 1, minWidth: 96 }}
              >
                {label}{val != null ? ` (${val} ${unit})` : ''}
              </Button>
            )
          })}
      </Stack>

      <Stack direction="row" spacing={1} alignItems="stretch">
        <TextField
          fullWidth
          type="text"
          inputMode={isMeasure ? 'decimal' : 'numeric'}
          autoComplete="off"
          label={isMeasure ? `Amount, ${unit}` : 'Other quantity, pcs'}
          value={custom}
          onChange={(e) => setCustom(e.target.value.replace(isMeasure ? /[^0-9.,]/g : /[^0-9]/g, ''))}
        />
        <Button
          variant="outlined"
          size="large"
          disabled={disabled || !custom}
          onClick={() => onPick(custom.replace(',', '.'))}
          sx={{ minWidth: 88 }}
        >
          OK
        </Button>
      </Stack>
    </Stack>
  )
}