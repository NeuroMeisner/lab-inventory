import { useEffect, useState } from 'react'
import {
  Alert, Autocomplete, Button, Chip, Dialog, DialogContent, DialogTitle, Grid, MenuItem, Stack,
  Tab, Tabs, TextField, Typography,
} from '@mui/material'
import { api, errorDetail } from '../api/client'
import type { Grant, Nomenclature, PurchaseOrder } from '../api/types'
import { useAuthStore } from '../store/auth'

export default function PurchaseOrders() {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const [tab, setTab] = useState(0)
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [message, setMessage] = useState<string | null>(null)

  const [adding, setAdding] = useState(false)
  const [nomOptions, setNomOptions] = useState<Nomenclature[]>([])
  const [selectedNom, setSelectedNom] = useState<Nomenclature | null>(null)
  const [form, setForm] = useState({ name_temp: '', expected_quantity: '', expected_date: '', supplier: '', grant_id: '' })
  const [grants, setGrants] = useState<Grant[]>([])

  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null)
  const [recv, setRecv] = useState({ quantities: '', batch_number: '', expiry_date: '', location: '', zone: 'storage' })
  const [recvNom, setRecvNom] = useState<Nomenclature | null>(null)

  const statuses = ['ordered', 'received', 'cancelled']
  const load = () =>
    api.get('/purchase-orders', { params: { limit: 200 } }).then((r) => setOrders(r.data.items)).catch(() => {})

  useEffect(() => { load(); api.get('/grants').then((r) => setGrants(r.data)).catch(() => {}) }, [])
  useEffect(() => {
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
      setMessage('✅ Order created')
      load()
    } catch (err) { setMessage(`❌ ${errorDetail(err)}`) }
  }

  const receive = async () => {
    if (!receiving) return
    try {
      const quantities = recv.quantities.split(',').map((s) => s.trim()).filter(Boolean)
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
      setMessage('✅ Received — packages created')
      load()
    } catch (err) { setMessage(`❌ ${errorDetail(err)}`) }
  }

  const cancel = async (o: PurchaseOrder) => { await api.put(`/purchase-orders/${o.id}/cancel`); load() }

  const visible = orders.filter((o) => o.status === statuses[tab])

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={700}>🛒 Purchase orders</Typography>
        <Button variant="contained" onClick={() => setAdding(true)}>+ New order</Button>
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab label="Ordered" /><Tab label="Received" /><Tab label="Cancelled" />
      </Tabs>

      <Stack spacing={1}>
        {visible.length === 0 && <Typography variant="body2" color="text.secondary">No orders in this status.</Typography>}
        {visible.map((o) => (
          <div key={o.id} style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
            <Stack direction="row" justifyContent="space-between">
              <Typography fontWeight={700}>{o.nomenclature_name ?? o.name_temp}</Typography>
              <Chip size="small" label={o.status} color={o.status === 'ordered' ? 'primary' : 'default'} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Qty: {o.expected_quantity ?? '—'}{o.expected_date ? ` · expected ${o.expected_date}` : ''}
              {o.supplier ? ` · ${o.supplier}` : ''}{o.grant_code ? ` · ${o.grant_code}` : ''} · by {o.created_by_name ?? '—'}
            </Typography>
            {isAdmin && o.status === 'ordered' && (
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Button size="small" variant="contained" onClick={() => { setReceiving(o); setRecv({ quantities: '', batch_number: '', expiry_date: '', location: '', zone: 'storage' }); setRecvNom(null) }}>
                  Receive
                </Button>
                <Button size="small" color="error" onClick={() => cancel(o)}>Cancel</Button>
              </Stack>
            )}
          </div>
        ))}
      </Stack>

      {message && <Alert severity={message.startsWith('❌') ? 'error' : 'success'} onClose={() => setMessage(null)}>{message}</Alert>}

      <Dialog open={adding} onClose={closeAddDialog} fullWidth>
        <DialogTitle>New purchase order</DialogTitle>
        <DialogContent><Stack spacing={2} sx={{ mt: 1 }}>
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
          <TextField type="number" label="Expected quantity" value={form.expected_quantity}
                     onChange={(e) => setForm({ ...form, expected_quantity: e.target.value })} />
          <TextField type="date" label="Expected date" InputLabelProps={{ shrink: true }} value={form.expected_date}
                     onChange={(e) => setForm({ ...form, expected_date: e.target.value })} />
          <TextField label="Supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
          <TextField select label="Grant" value={form.grant_id} onChange={(e) => setForm({ ...form, grant_id: e.target.value })}>
            <MenuItem value="">No grant</MenuItem>
            {grants.map((g) => <MenuItem key={g.id} value={g.id}>{g.code}</MenuItem>)}
          </TextField>
          <Button variant="contained" disabled={!selectedNom && !form.name_temp} onClick={addOrder}>Create</Button>
        </Stack></DialogContent>
      </Dialog>

      <Dialog open={!!receiving} onClose={() => { setReceiving(null); setRecvNom(null) }} fullWidth>
        <DialogTitle>Receive: {receiving?.nomenclature_name ?? receiving?.name_temp} ({receiving?.expected_quantity})</DialogTitle>
        <DialogContent><Stack spacing={2} sx={{ mt: 1 }}>
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
          <Alert severity="info">Split the expected quantity into packages. Example for qty 10: <code>4,6</code>. The sum must equal the expected quantity.</Alert>
          <TextField label="Quantities per package (comma-separated)" value={recv.quantities}
                     onChange={(e) => setRecv({ ...recv, quantities: e.target.value })} />
          <Grid container spacing={1.5}>
            <Grid item xs={6}><TextField fullWidth label="Batch number" value={recv.batch_number} onChange={(e) => setRecv({ ...recv, batch_number: e.target.value })} /></Grid>
            <Grid item xs={6}><TextField fullWidth type="date" label="Expiry" InputLabelProps={{ shrink: true }} value={recv.expiry_date} onChange={(e) => setRecv({ ...recv, expiry_date: e.target.value })} /></Grid>
            <Grid item xs={6}><TextField fullWidth label="Location (optional)" value={recv.location} onChange={(e) => setRecv({ ...recv, location: e.target.value })} /></Grid>
            <Grid item xs={6}>
              <TextField fullWidth select label="Zone" value={recv.zone} onChange={(e) => setRecv({ ...recv, zone: e.target.value })}>
                <MenuItem value="storage">storage</MenuItem>
                <MenuItem value="in_use">in_use</MenuItem>
              </TextField>
            </Grid>
          </Grid>
          <Button variant="contained" onClick={receive} disabled={!receiving?.nomenclature_id && !recvNom}>Confirm receipt</Button>
        </Stack></DialogContent>
      </Dialog>
    </Stack>
  )
}