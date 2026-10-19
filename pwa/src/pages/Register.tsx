import { useEffect, useState } from 'react'
import {
  Alert, Autocomplete, Button, Card, CardContent, Checkbox, Divider, FormControlLabel, Grid,
  MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import { useNavigate } from 'react-router-dom'
import { api, CODEGEN_URL, errorDetail } from '../api/client'
import type { Grant, Nomenclature, PackageInfo } from '../api/types'
import { useDebounce } from '../hooks/useDebounce'
import Scanner from '../components/Scanner'
import { parseDatamatrix } from '../utils/gs1'

export default function Register() {
  const navigate = useNavigate()
  const [nomQuery, setNomQuery] = useState('')
  const debounced = useDebounce(nomQuery, 300)
  const [options, setOptions] = useState<Nomenclature[]>([])
  const [nom, setNom] = useState<Nomenclature | null>(null)
  const [creatingNew, setCreatingNew] = useState(false)
  const [nomForm, setNomForm] = useState({
    name: '', synonyms: '', cas_number: '', unit: '', category: '', tracking_mode: 'free',
    storage_temp: '', min_stock: '0', is_hazardous: false,
  })
  const [grants, setGrants] = useState<Grant[]>([])
  const [pkgForm, setPkgForm] = useState({
    batch_number: '', expiry_date: '', nominal_amount: '', current_amount: '', grant_id: '', location: '',
  })
  const [created, setCreated] = useState<PackageInfo | null>(null)
  const [labelUrl, setLabelUrl] = useState<string | null>(null)
  const [copies, setCopies] = useState(2)
  const [message, setMessage] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => { api.get('/grants').then((r) => setGrants(r.data)).catch(() => {}) }, [])

  useEffect(() => {
    if (debounced.length < 2) { setOptions([]); return }
    api.get('/nomenclature', { params: { q: debounced } }).then((r) => setOptions(r.data.items)).catch(() => {})
  }, [debounced])

  const createNomenclature = async () => {
    try {
      const { data } = await api.post('/nomenclature', {
        ...nomForm,
        synonyms: nomForm.synonyms ? nomForm.synonyms.split(',').map((s) => s.trim()).filter(Boolean) : [],
        cas_number: nomForm.cas_number || null,
        storage_temp: nomForm.storage_temp || null,
        min_stock: nomForm.min_stock || '0',
      })
      setNom(data)
      setCreatingNew(false)
      setMessage(`✅ Nomenclature created. Internal code: ${data.nomenclature_code}`)
    } catch (err) { setMessage(`❌ ${errorDetail(err)}`) }
  }

  const labelData = () => created && ({
    nomenclature_code: nom?.nomenclature_code,
    batch_number: created.batch_number || null,
    expiry_date: created.expiry_date,
    package_id: created.id,
    name: created.nomenclature_name,
    grant_code: created.grant_code,
    grant_manager: created.grant_manager,
  })

const previewLabel = async () => {
  if (!created) return
  try {
    const internalSecret = import.meta.env.VITE_INTERNAL_API_SECRET || ''
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (internalSecret) {
      headers['X-Internal-Secret'] = internalSecret
    }
    
    const resp = await fetch(`${CODEGEN_URL}/render/package-label`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: labelData(), dpi: 200 }),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    setLabelUrl(URL.createObjectURL(await resp.blob()))
  } catch (err) {
    setMessage(`❌ Failed to preview label: ${err instanceof Error ? err.message : 'unknown error'}`)
  }
}

  const printLabels = async () => {
    try {
      const resp = await fetch(`${CODEGEN_URL}/print`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label_type: 'package', data: labelData(), copies }),
      })
      const body = await resp.json()
      if (body.status === 'success') setMessage(`✅ Sent ${copies} label(s) to printer`)
      else setMessage(`❌ Printing failed: ${body.error} — ${body.message ?? ''}`)
    } catch { setMessage('❌ Code generator service is not available') }
  }

  const submitPackage = async () => {
    if (!nom) return
    try {
      const { data } = await api.post('/packages', {
        nomenclature_id: nom.id,
        batch_number: pkgForm.batch_number || null,
        expiry_date: pkgForm.expiry_date || null,
        nominal_amount: pkgForm.nominal_amount || null,
        current_amount: pkgForm.current_amount || pkgForm.nominal_amount || null,
        grant_id: pkgForm.grant_id ? Number(pkgForm.grant_id) : null,
        location: pkgForm.location || null,
        zone: 'storage',
      })
      setCreated(data)
      setMessage(`✅ Package ${data.display_code} created. Print the label and stick it on the package.`)
    } catch (err) { setMessage(`❌ ${errorDetail(err)}`) }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={700}>📦 Register new package</Typography>

      {!nom && !creatingNew && (
        <Card><CardContent><Stack spacing={2}>
          <Autocomplete
            options={options} getOptionLabel={(o) => `${o.name} (${o.nomenclature_code})`}
            onInputChange={(_, v) => setNomQuery(v)} onChange={(_, v) => setNom(v)}
            renderInput={(p) => <TextField {...p} label="Find an existing item" />}
          />
          <Button onClick={() => setCreatingNew(true)}>Item not found — create new nomenclature</Button>
        </Stack></CardContent></Card>
      )}

      {creatingNew && (
        <Card><CardContent><Stack spacing={2}>
          <Typography fontWeight={700}>New nomenclature</Typography>
          <Grid container spacing={1.5}>
            <Grid item xs={12}><TextField fullWidth label="Name *" value={nomForm.name} onChange={(e) => setNomForm({ ...nomForm, name: e.target.value })} /></Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth label="Synonyms (comma-separated)" value={nomForm.synonyms} onChange={(e) => setNomForm({ ...nomForm, synonyms: e.target.value })} /></Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth label="CAS number" value={nomForm.cas_number} onChange={(e) => setNomForm({ ...nomForm, cas_number: e.target.value })} /></Grid>
            <Grid item xs={6} sm={3}><TextField fullWidth label="Unit *" value={nomForm.unit} onChange={(e) => setNomForm({ ...nomForm, unit: e.target.value })} /></Grid>
            <Grid item xs={6} sm={3}><TextField fullWidth label="Category *" value={nomForm.category} onChange={(e) => setNomForm({ ...nomForm, category: e.target.value })} /></Grid>
            <Grid item xs={6} sm={3}>
              <TextField fullWidth select label="Tracking mode" value={nomForm.tracking_mode} onChange={(e) => setNomForm({ ...nomForm, tracking_mode: e.target.value })}>
                <MenuItem value="free">free</MenuItem>
                <MenuItem value="per_unit">per_unit</MenuItem>
                <MenuItem value="by_measure">by_measure</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={6} sm={3}><TextField fullWidth label="Storage temp" value={nomForm.storage_temp} onChange={(e) => setNomForm({ ...nomForm, storage_temp: e.target.value })} /></Grid>
            <Grid item xs={6} sm={3}><TextField fullWidth type="number" label="Min stock" value={nomForm.min_stock} onChange={(e) => setNomForm({ ...nomForm, min_stock: e.target.value })} /></Grid>
            <Grid item xs={6} sm={3}><FormControlLabel control={<Checkbox checked={nomForm.is_hazardous} onChange={(e) => setNomForm({ ...nomForm, is_hazardous: e.target.checked })} />} label="Hazardous" /></Grid>
          </Grid>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" disabled={!nomForm.name || !nomForm.unit || !nomForm.category} onClick={createNomenclature}>Create item</Button>
            <Button onClick={() => setCreatingNew(false)}>Back</Button>
          </Stack>
        </Stack></CardContent></Card>
      )}

      {nom && !created && (
        <Card><CardContent><Stack spacing={2}>
          <Typography>Item: <b>{nom.name}</b> ({nom.nomenclature_code}) <Button size="small" onClick={() => setNom(null)}>change</Button></Typography>
          <Divider />
          <Grid container spacing={1.5}>
            <Grid item xs={6} sm={3}><TextField fullWidth label="Batch number" value={pkgForm.batch_number} onChange={(e) => setPkgForm({ ...pkgForm, batch_number: e.target.value })} /></Grid>
            <Grid item xs={6} sm={3}><TextField fullWidth type="date" label="Expiry" InputLabelProps={{ shrink: true }} value={pkgForm.expiry_date} onChange={(e) => setPkgForm({ ...pkgForm, expiry_date: e.target.value })} /></Grid>
            <Grid item xs={6} sm={3}><TextField fullWidth type="number" label={`Nominal, ${nom.unit}`} value={pkgForm.nominal_amount} onChange={(e) => setPkgForm({ ...pkgForm, nominal_amount: e.target.value })} /></Grid>
            <Grid item xs={6} sm={3}><TextField fullWidth type="number" label="Current (if different)" value={pkgForm.current_amount} onChange={(e) => setPkgForm({ ...pkgForm, current_amount: e.target.value })} /></Grid>
            <Grid item xs={6} sm={4}>
              <TextField fullWidth select label="Grant" value={pkgForm.grant_id} onChange={(e) => setPkgForm({ ...pkgForm, grant_id: e.target.value })}>
                <MenuItem value="">No grant</MenuItem>
                {grants.map((g) => <MenuItem key={g.id} value={g.id}>{g.code} ({g.manager_name})</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={6} sm={4}><TextField fullWidth label="Location (optional)" value={pkgForm.location} onChange={(e) => setPkgForm({ ...pkgForm, location: e.target.value })} /></Grid>
          </Grid>
          <Button variant="contained" onClick={submitPackage}>Create package</Button>
        </Stack></CardContent></Card>
      )}

    {created && (
      <Card><CardContent><Stack spacing={2}>
        <Alert severity="success">Package {created.display_code} created. DataMatrix content: <code>{created.datamatrix_code}</code></Alert>
        {labelUrl && (
          <img 
            src={labelUrl} 
            alt="Label preview" 
            style={{ 
              maxWidth: '100%', 
              width: 'auto', 
              height: 'auto', 
              border: '1px solid #ddd',
              borderRadius: 4
            }} 
          />
        )}
        <Stack direction="row" spacing={1} alignItems="center">
          <Button variant="outlined" onClick={previewLabel}>🔍 Preview label</Button>
          <TextField size="small" type="number" label="Copies" value={copies} onChange={(e) => setCopies(Math.max(1, Number(e.target.value)))} sx={{ width: 100 }} />
          <Button variant="contained" onClick={printLabels}>🖨 Print labels</Button>
        </Stack>
        <Divider />
        <Typography fontWeight={700}>Step 2: Verify the printed label</Typography>
        <Typography variant="body2" color="text.secondary">
          After printing, scan one of the labels to confirm it reads correctly.
        </Typography>
        {confirming ? (
          <Scanner
            hint="Scan the printed DataMatrix"
            onResult={(text) => {
              const ref = parseDatamatrix(text)
              if (ref.packageId === created.id) {
                setMessage('✅ Label verified — it matches this package.')
                setConfirming(false)
              } else setMessage(`❌ This label belongs to package ${ref.packageId ?? '?'}, not ${created.id}`)
            }}
            onCancel={() => setConfirming(false)}
          />
        ) : (
          <Button variant="contained" size="large" color="primary" onClick={() => setConfirming(true)} startIcon={<QrCodeScannerIcon />}>
            📷 Start scan to verify
          </Button>
        )}
        <Divider />
        <Typography variant="body2" color="text.secondary">
          After verification, place the package on its storage location.
        </Typography>
        <Button variant="contained" size="large" color="secondary" onClick={() => navigate('/relocate')} endIcon={<ArrowForwardIcon />}>
          📍 Next: Place the package
        </Button>
      </Stack></CardContent></Card>
    )}

      {message && <Alert severity={message.startsWith('❌') ? 'error' : 'success'}>{message}</Alert>}
    </Stack>
  )
}