import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Dialog, DialogContent, DialogTitle, IconButton, MenuItem, Stack, Tab, Table,
  TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { api, errorDetail } from '../api/client'
import type { Grant, Nomenclature, PackageInfo, TransactionInfo, User } from '../api/types'
import { downloadCsv } from '../utils/csv'

export default function Admin() {
  const [tab, setTab] = useState(0)
  const [message, setMessage] = useState<string | null>(null)

  const [noms, setNoms] = useState<Nomenclature[]>([])
  const [nomQ, setNomQ] = useState('')
  const [editing, setEditing] = useState<Nomenclature | null>(null)
  const [editMode, setEditMode] = useState('free')

  const [packages, setPackages] = useState<PackageInfo[]>([])
  const [txs, setTxs] = useState<TransactionInfo[]>([])
  const [txFilter, setTxFilter] = useState({ date_from: '', date_to: '', type: '' })
  const [users, setUsers] = useState<User[]>([])
  const [grants, setGrants] = useState<Grant[]>([])
  const [grantForm, setGrantForm] = useState({ code: '', manager_name: '', expiry_date: '' })

  const [report, setReport] = useState<{ grantId: string; from: string; to: string; items: any[] }>({ grantId: '', from: '', to: '', items: [] })

  const loadNoms = () => api.get('/nomenclature', { params: { q: nomQ || undefined, limit: 100 } }).then((r) => setNoms(r.data.items))
  const loadPackages = () => api.get('/packages', { params: { limit: 100 } }).then((r) => setPackages(r.data.items))
  const loadTxs = () => api.get('/transactions', {
    params: { date_from: txFilter.date_from || undefined, date_to: txFilter.date_to || undefined, type: txFilter.type || undefined, limit: 200 },
  }).then((r) => setTxs(r.data.items))
  const loadUsers = () => api.get('/users').then((r) => setUsers(r.data)).catch((e) => setMessage(`❌ ${errorDetail(e)} (нужен патч бэкенда — см. раздел «Патч бэкенда» в сообщении)`))
  const loadGrants = () => api.get('/grants', { params: { is_active: undefined as any } }).then((r) => setGrants(r.data))

  useEffect(() => {
    if (tab === 0) loadNoms()
    if (tab === 1) loadPackages()
    if (tab === 2) loadTxs()
    if (tab === 3) loadUsers()
    if (tab === 4) loadGrants()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const saveTrackingMode = async () => {
    if (!editing) return
    try {
      await api.put(`/nomenclature/${editing.id}`, { tracking_mode: editMode })
      setEditing(null)
      setMessage('✅ Updated (change logged in audit_log)')
      loadNoms()
    } catch (err) { setMessage(`❌ ${errorDetail(err)}`) }
  }

  const createGrant = async () => {
    try {
      await api.post('/grants', grantForm)
      setGrantForm({ code: '', manager_name: '', expiry_date: '' })
      loadGrants()
    } catch (err) { setMessage(`❌ ${errorDetail(err)}`) }
  }

  const loadReport = async () => {
    if (!report.grantId) return
    try {
      const { data } = await api.get(`/reports/grants/${report.grantId}/consumption`, {
        params: { date_from: report.from || undefined, date_to: report.to || undefined },
      })
      setReport({ ...report, items: data.items })
    } catch (err) { setMessage(`❌ ${errorDetail(err)}`) }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={700}>⚙️ Admin panel</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable">
        <Tab label="Nomenclature" /><Tab label="Packages" /><Tab label="Transactions" />
        <Tab label="Users" /><Tab label="Grants" /><Tab label="Reports" />
      </Tabs>

      {message && <Alert severity={message.startsWith('❌') ? 'error' : 'success'} onClose={() => setMessage(null)}>{message}</Alert>}

      {tab === 0 && (
        <Stack spacing={1}>
          <Stack direction="row" spacing={1}>
            <TextField size="small" label="Search" value={nomQ} onChange={(e) => setNomQ(e.target.value)} />
            <Button onClick={loadNoms}>Find</Button>
            <Button variant="outlined" onClick={() => downloadCsv('nomenclature.csv',
              ['id', 'code', 'name', 'unit', 'category', 'tracking_mode', 'min_stock'],
              noms.map((n) => [n.id, n.nomenclature_code, n.name, n.unit, n.category, n.tracking_mode, n.min_stock]))}>
              Export CSV
            </Button>
          </Stack>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>ID</TableCell><TableCell>Name</TableCell><TableCell>Unit</TableCell>
              <TableCell>Category</TableCell><TableCell>Mode</TableCell><TableCell />
            </TableRow></TableHead>
            <TableBody>
              {noms.map((n) => (
                <TableRow key={n.id}>
                  <TableCell>{n.id}</TableCell><TableCell>{n.name}</TableCell><TableCell>{n.unit}</TableCell>
                  <TableCell>{n.category}</TableCell><TableCell>{n.tracking_mode}</TableCell>
                  <TableCell><Button size="small" onClick={() => { setEditing(n); setEditMode(n.tracking_mode) }}>Edit mode</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Stack>
      )}

      {tab === 1 && (
        <Table size="small">
          <TableHead><TableRow>
            <TableCell>Code</TableCell><TableCell>Name</TableCell><TableCell>Amount</TableCell>
            <TableCell>Zone</TableCell><TableCell>Location</TableCell><TableCell>Status</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {packages.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.display_code}</TableCell><TableCell>{p.nomenclature_name}</TableCell>
                <TableCell>{p.current_amount ?? '—'}/{p.nominal_amount ?? '—'}</TableCell>
                <TableCell>{p.zone}</TableCell><TableCell>{p.location ?? '—'}</TableCell><TableCell>{p.placement_status}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {tab === 2 && (
        <Stack spacing={1}>
          <Stack direction="row" spacing={1}>
            <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={txFilter.date_from} onChange={(e) => setTxFilter({ ...txFilter, date_from: e.target.value })} />
            <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={txFilter.date_to} onChange={(e) => setTxFilter({ ...txFilter, date_to: e.target.value })} />
            <Button onClick={loadTxs}>Apply</Button>
            <Button variant="outlined" onClick={() => downloadCsv('transactions.csv',
              ['id', 'time', 'package', 'user', 'type', 'amount', 'from', 'to', 'comment'],
              txs.map((t) => [t.id, t.timestamp, t.package_code, t.user_name, t.type, t.amount, t.from_location, t.to_location, t.comment]))}>
              Export CSV
            </Button>
          </Stack>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>Time</TableCell><TableCell>Package</TableCell><TableCell>User</TableCell>
              <TableCell>Type</TableCell><TableCell>Amount</TableCell><TableCell>From → To</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {txs.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{new Date(t.timestamp).toLocaleString()}</TableCell><TableCell>{t.package_code}</TableCell>
                  <TableCell>{t.user_name ?? '—'}</TableCell><TableCell>{t.type}</TableCell>
                  <TableCell>{t.amount ?? ''}</TableCell><TableCell>{t.from_location ?? ''} → {t.to_location ?? ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Stack>
      )}

      {tab === 3 && (
        <Table size="small">
          <TableHead><TableRow>
            <TableCell>ID</TableCell><TableCell>Email</TableCell><TableCell>Name</TableCell>
            <TableCell>Role</TableCell><TableCell>Telegram</TableCell><TableCell>Linked</TableCell><TableCell>Active</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.id}</TableCell><TableCell>{u.google_email}</TableCell><TableCell>{u.full_name}</TableCell>
                                  <TableCell>
                    <Button
                      size="small"
                      variant={u.role === 'admin' ? 'contained' : 'outlined'}
                      onClick={async () => {
                        const newRole = u.role === 'admin' ? 'user' : 'admin'
                        try {
                          await api.put(`/users/${u.id}/role`, { role: newRole })
                          setMessage('✅ Role updated')
                          loadUsers()
                        } catch (err) { setMessage(`❌ ${errorDetail(err)}`) }
                      }}
                    >
                      {u.role === 'admin' ? '👑 admin' : '👤 user'}
                    </Button>
                  </TableCell>                
                <TableCell>{u.telegram_id ?? '—'}</TableCell>
                <TableCell>{u.accounts_linked ? '✅' : '—'}</TableCell><TableCell>{u.is_active ? '✅' : '❌'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {tab === 4 && (
        <Stack spacing={2}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Code</TableCell><TableCell>Manager</TableCell><TableCell>Expiry</TableCell><TableCell>Active</TableCell></TableRow></TableHead>
            <TableBody>
              {grants.map((g) => (
                <TableRow key={g.id}>
                  <TableCell>{g.code}</TableCell><TableCell>{g.manager_name}</TableCell>
                  <TableCell>{g.expiry_date ?? '—'}</TableCell>
                  <TableCell><Button size="small" onClick={async () => { await api.put(`/grants/${g.id}`, { is_active: !g.is_active }); loadGrants() }}>{g.is_active ? 'Deactivate' : 'Activate'}</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Stack direction="row" spacing={1}>
            <TextField size="small" label="Code" value={grantForm.code} onChange={(e) => setGrantForm({ ...grantForm, code: e.target.value })} />
            <TextField size="small" label="Manager" value={grantForm.manager_name} onChange={(e) => setGrantForm({ ...grantForm, manager_name: e.target.value })} />
            <TextField size="small" type="date" InputLabelProps={{ shrink: true }} value={grantForm.expiry_date} onChange={(e) => setGrantForm({ ...grantForm, expiry_date: e.target.value })} />
            <Button variant="contained" disabled={!grantForm.code || !grantForm.manager_name} onClick={createGrant}>Add grant</Button>
          </Stack>
        </Stack>
      )}

      {tab === 5 && (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1}>
            <TextField size="small" select label="Grant" value={report.grantId} onChange={(e) => setReport({ ...report, grantId: e.target.value })} sx={{ minWidth: 180 }}>
              {grants.map((g) => <MenuItem key={g.id} value={g.id}>{g.code}</MenuItem>)}
            </TextField>
            <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={report.from} onChange={(e) => setReport({ ...report, from: e.target.value })} />
            <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={report.to} onChange={(e) => setReport({ ...report, to: e.target.value })} />
            <Button variant="contained" onClick={loadReport}>Load</Button>
          </Stack>
          {report.items.length > 0 && (
            <>
              <Button variant="outlined" onClick={() => downloadCsv('grant_consumption.csv',
                ['nomenclature', 'unit', 'total_amount', 'write_offs'],
                report.items.map((i: any) => [i.name, i.unit, i.total_amount, i.write_off_count]))}>
                Export CSV
              </Button>
              <Table size="small">
                <TableHead><TableRow><TableCell>Item</TableCell><TableCell>Unit</TableCell><TableCell>Total</TableCell><TableCell>Write-offs</TableCell></TableRow></TableHead>
                <TableBody>
                  {report.items.map((i: any) => (
                    <TableRow key={i.nomenclature_id}>
                      <TableCell>{i.name}</TableCell><TableCell>{i.unit}</TableCell>
                      <TableCell>{i.total_amount}</TableCell><TableCell>{i.write_off_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </Stack>
      )}

      <Dialog open={!!editing} onClose={() => setEditing(null)}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Change tracking mode
          <IconButton onClick={() => setEditing(null)} size="small" aria-label="close">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent><Stack spacing={2} sx={{ mt: 1 }}>
          <Alert severity="warning">
            Changing the tracking mode affects how write-offs are recorded for <b>{editing?.name}</b>. This change will be logged. Continue?
          </Alert>
          <TextField select value={editMode} onChange={(e) => setEditMode(e.target.value)}>
            <MenuItem value="free">free</MenuItem>
            <MenuItem value="per_unit">per_unit</MenuItem>
            <MenuItem value="by_measure">by_measure</MenuItem>
          </TextField>
          <Button variant="contained" onClick={saveTrackingMode}>Confirm change</Button>
        </Stack></DialogContent>
      </Dialog>
    </Stack>
  )
}