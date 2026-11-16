import { useEffect, useState } from 'react'
import {
  Alert, Autocomplete, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  MenuItem, Skeleton, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material'
import { api, errorDetail } from '../api/client'
import type { Grant, Nomenclature, PurchaseOrder } from '../api/types'
import { useAuthStore } from '../store/auth'

export default function PurchaseOrders() {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const [tab, setTab] = useState(0)
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [messageSeverity, setMessageSeverity] = useState<'success' | 'error' | 'warning'>('success')

  const [adding, setAdding] = useState(false)
  const [nomOptions, setNomOptions] = useState<Nomenclature[]>([])
  const [selectedNom, setSelectedNom] = useState<Nomenclature | null>(null)
  const [form, setForm] = useState({ name_temp: '', expected_quantity: '', expected_date: '', supplier: '', grant_id: '' })
  const [grants, setGrants] = useState<Grant[]>([])

  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null)
  const [recvPackages, setRecvPackages] = useState<string[]>([''])
  const [recv, setRecv] = useState({ batch_number: '', expiry_date: '', location: '', zone: 'storage' })
  const [recvNom, setRecvNom] = useState<Nomenclature | null>(null)
  const [cancelConfirm, setCancelConfirm] = useState<PurchaseOrder | null>(null)

  const showMsg = (text: string, sev: 'success' | 'error' | 'warning' = 'success') => {
    setMessage(text)
    setMessageSeverity(sev)
  }

  const statuses = ['ordered', 'received', 'cancelled']
  const load = () => {
    setLoading(true)
    api.get('/purchase-orders', { params: { limit: 200 } })
      .then((r) => setOrders(r.data.items))
      .catch((e) => showMsg(errorDetail(e), 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    api.get('/grants').then((r) => setGrants(r.data)).catch(() => {})
    api.get('/nomenclature', { params: { limit: 200 } }).then((r) => setNomOptions(r.data.items)).catch(() => {})
  }, [])

  const closeAddDialog = () => {
    setAdding(false)
    setSelectedNom(null)
    setForm({ name_temp: '', expected_quantity: '', expected_date: '', supplier: '', grant_id: '' })
  }

  const addOrder = async () => {
    try {
      await api.post('/purchase-orders', {
        nomenclature_id: selectedNom ? selectedNom.id : null,
        name_temp: selectedNom ? null : (form.name_temp || null),
        expected_quantity: form.expected_quantity || null,
        expected_date: form.expected_date || null,
        supplier: form.supplier || null,
        grant_id: form.grant_id ? Number(form.grant_id) : null,
      })
      closeAddDialog()
      showMsg('Order created')
      load()
    } catch (err) { showMsg(errorDetail(err), 'error') }
  }

  const receive = async () => {
    if (!receiving) return
    try {
      const quantities = recvPackages.map((s) => s.trim()).filter(Boolean)
      await api.put(`/purchase-orders/${receiving.id}/receive`, {
        quantities,
        batch_number: recv.batch_number || null,
        expiry_date: recv.expiry_date || null,
        location: recv.location || null,
        zone: recv.zone,
        nomenclature_id: receiving.nomenclature_id ? null : (recvNom ? recvNom.id : null),
      })
      setReceiving(null)
      setRecvNom(null)
      setRecvPackages([''])
      showMsg('Received — packages created')
      load()
    } catch (err) { showMsg(errorDetail(err), 'error') }
  }

  const doCancel = async () => {
    if (!cancelConfirm) return
    try {
      await api.put(`/purchase-orders/${cancelConfirm.id}/cancel`)
      setCancelConfirm(null)
      showMsg('Order cancelled')
      load()
    } catch (err) { showMsg(errorDetail(err), 'error') }
  }

  const receivedTotal = recvPackages.reduce((s, v) => s + (Number(v) || 0), 0)
  const expectedTotal = Number(receiving?.expected_quantity ?? 0)
  const remaining = expectedTotal - receivedTotal
  const splitValid = receivedTotal > 0 && (expectedTotal === 0 || receivedTotal <= expectedTotal)

  const visible = orders.filter((o) => o.status === statuses[tab])

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5">Purchase orders</Typography>
        <Button variant="contained" size="large" onClick={() => setAdding(true)}>New order</Button>
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab label="Ordered" /><Tab label="Received" /><Tab label="Cancelled" />
      </Tabs>

      {message && <Alert severity={messageSeverity} onClose={() => setMessage(null)}>{message}</Alert>}

      {loading && <Skeleton variant="rounded" height={120} />}

      {!loading && (
        <Stack spacing={1}>
          {visible.length === 0 && (
            <Typography variant="body2" color="text.secondary">No orders in this status.</Typography>
          )}
          {visible.map((o) => (
            <Stack
              key={o.id}
              spacing={1}
              sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                <Typography fontWeight={700}>{o.nomenclature_name ?? o.name_temp}</Typography>
                <Chip size="small" label={o.status} color={o.status === 'ordered' ? 'primary' : 'default'} />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                Qty: {o.expected_quantity ?? '—'}{o.expected_date ? ` · expected ${o.expected_date}` : ''}
                {o.supplier ? ` · ${o.supplier}` : ''}{o.grant_code ? ` · ${o.grant_code}` : ''} · by {o.created_by_name ?? '—'}
              </Typography>
              {isAdmin && o.status === 'ordered' && (
                <Stack direction="row" spacing={1}>
                  <Button
                    size="large"
                    variant="contained"
                    onClick={() => {
                      setReceiving(o)
                      setRecvPackages([''])
                      setRecv({ batch_number: '', expiry_date: '', location: '', zone: 'storage' })
                      setRecvNom(null)
                    }}
                  >
                    Receive
                  </Button>
                  <Button size="large" color="error" onClick={() => setCancelConfirm(o)}>Cancel</Button>
                </Stack>
              )}
            </Stack>
          ))}
        </Stack>
      )}

      {/* Создание заказа */}
      <Dialog open={adding} onClose={closeAddDialog} fullWidth maxWidth="sm">
        <DialogTitle>New purchase order</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Autocomplete
              options={nomOptions}
              value={selectedNom}
              onChange={(_, v) => setSelectedNom(v)}
              getOptionLabel={(o) => `${o.name}${o.cas_number ? ` (CAS ${o.cas_number})` : ''}`}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              renderInput={(p) => <TextField {...p} label="Select existing item (start typing)" />}
            />
            <Typography variant="caption" color="text.secondary">…or, if the item is not in the catalogue yet:</Typography>
            <TextField label="New item name (temporary)" value={form.name_temp}
              onChange={(e) => setForm({ ...form, name_temp: e.target.value })} disabled={!!selectedNom} />
            <TextField type="text" inputMode="numeric" label="Expected quantity" value={form.expected_quantity}
              onChange={(e) => setForm({ ...form, expected_quantity: e.target.value.replace(/[^0-9]/g, '') })} />
            <TextField type="date" label="Expected date" InputLabelProps={{ shrink: true }} value={form.expected_date}
              onChange={(e) => setForm({ ...form, expected_date: e.target.value })} />
            <TextField label="Supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
            <TextField select label="Grant" value={form.grant_id} onChange={(e) => setForm({ ...form, grant_id: e.target.value })}>
              <MenuItem value="">No grant</MenuItem>
              {grants.map((g) => <MenuItem key={g.id} value={g.id}>{g.code}</MenuItem>)}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button size="large" onClick={closeAddDialog}>Cancel</Button>
          <Button size="large" variant="contained" disabled={!selectedNom && !form.name_temp} onClick={addOrder}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Приёмка */}
      <Dialog open={!!receiving} onClose={() => { setReceiving(null); setRecvNom(null) }} fullWidth maxWidth="sm">
        <DialogTitle>Receive: {receiving?.nomenclature_name ?? receiving?.name_temp}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {!receiving?.nomenclature_id && (
              <>
                <Alert severity="warning">This order was created for an item not yet in the catalogue. Choose which existing item it corresponds to:</Alert>
                <Autocomplete
                  options={nomOptions}
                  value={recvNom}
                  onChange={(_, v) => setRecvNom(v)}
                  getOptionLabel={(o) => `${o.name}${o.cas_number ? ` (CAS ${o.cas_number})` : ''}`}
                  isOptionEqualToValue={(o, v) => o.id === v.id}
                  renderInput={(p) => <TextField {...p} label="Link to existing item" />}
                />
              </>
            )}

            <Alert severity="info">
              Expected quantity: <b>{receiving?.expected_quantity ?? '—'}</b>. Split into packages below.
            </Alert>

            <Stack spacing={1}>
              {recvPackages.map((v, idx) => (
                <Stack key={idx} direction="row" spacing={1} alignItems="center">
                  <TextField
                    fullWidth
                    type="text"
                    inputMode="decimal"
                    label={`Package ${idx + 1} amount`}
                    value={v}
                    onChange={(e) => {
                      const next = [...recvPackages]
                      next[idx] = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.')
                      setRecvPackages(next)
                    }}
                  />
                  {recvPackages.length > 1 && (
                    <Button
                      size="large"
                      color="error"
                      onClick={() => setRecvPackages(recvPackages.filter((_, i) => i !== idx))}
                    >
                      Remove
                    </Button>
                  )}
                </Stack>
              ))}
              <Button size="large" onClick={() => setRecvPackages([...recvPackages, ''])}>+ Add package</Button>
            </Stack>

            <Typography variant="body2" color={splitValid ? 'text.secondary' : 'error.main'}>
              Entered: {receivedTotal} of {expectedTotal}
              {remaining !== 0 ? ` · ${remaining > 0 ? 'remaining' : 'over'} ${Math.abs(remaining)}` : ' · matches expected'}
            </Typography>

            <Divider />

            <TextField label="Batch number" value={recv.batch_number} onChange={(e) => setRecv({ ...recv, batch_number: e.target.value })} />
            <TextField type="date" label="Expiry" InputLabelProps={{ shrink: true }} value={recv.expiry_date} onChange={(e) => setRecv({ ...recv, expiry_date: e.target.value })} />
            <TextField label="Location (optional)" value={recv.location} onChange={(e) => setRecv({ ...recv, location: e.target.value })} />
            <TextField select label="Zone" value={recv.zone} onChange={(e) => setRecv({ ...recv, zone: e.target.value })}>
              <MenuItem value="storage">storage</MenuItem>
              <MenuItem value="in_use">in_use</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button size="large" onClick={() => { setReceiving(null); setRecvNom(null) }}>Cancel</Button>
          <Button size="large" variant="contained" onClick={receive} disabled={!splitValid || (!receiving?.nomenclature_id && !recvNom)}>
            Confirm receipt
          </Button>
        </DialogActions>
      </Dialog>

      {/* Подтверждение отмены */}
      <Dialog open={!!cancelConfirm} onClose={() => setCancelConfirm(null)}>
        <DialogTitle>Cancel order?</DialogTitle>
        <DialogContent>
          <Typography>
            Cancel order for <b>{cancelConfirm?.nomenclature_name ?? cancelConfirm?.name_temp}</b>? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button size="large" onClick={() => setCancelConfirm(null)}>Keep</Button>
          <Button size="large" color="error" variant="contained" onClick={doCancel}>Cancel order</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}