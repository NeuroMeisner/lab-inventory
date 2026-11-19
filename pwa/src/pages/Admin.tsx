import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Skeleton,
  Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { Navigate, useSearchParams } from 'react-router-dom'
import { api, errorDetail } from '../api/client'
import type { Grant, Nomenclature, PackageInfo, TransactionInfo, User } from '../api/types'
import { downloadCsv } from '../utils/csv'
import { useAuthStore } from '../store/auth'

const TABS = ['Nomenclature', 'Packages', 'Transactions', 'Users', 'Grants', 'Reports']

export default function Admin() {
  const user = useAuthStore((s) => s.user)
  const [params, setParams] = useSearchParams()
  const tabParam = Number(params.get('tab') ?? '0')
  const tab = Number.isFinite(tabParam) && tabParam >= 0 && tabParam < TABS.length ? tabParam : 0
  const setTab = (v: number) => setParams({ tab: String(v) })

  const [message, setMessage] = useState<string | null>(null)
  const [messageSeverity, setMessageSeverity] = useState<'success' | 'error' | 'warning'>('success')
  const [loading, setLoading] = useState(false)

  const [noms, setNoms] = useState<Nomenclature[]>([])
  const [nomQ, setNomQ] = useState('')
  const [editing, setEditing] = useState<Nomenclature | null>(null)
  const [editMode, setEditMode] = useState('free')

  const [packages, setPackages] = useState<PackageInfo[]>([])
  const [txs, setTxs] = useState<TransactionInfo[]>([])
  const [txFilter, setTxFilter] = useState({ date_from: '', date_to: '', type: '' })
  const [users, setUsers] = useState<User[]>([])
  const [roleConfirm, setRoleConfirm] = useState<{ user: User; newRole: 'admin' | 'user' } | null>(null)
  const [deactConfirm, setDeactConfirm] = useState<User | null>(null)
  const [anonymizeConfirm, setAnonymizeConfirm] = useState<User | null>(null)
  const [anonymizeReason, setAnonymizeReason] = useState('')
  const [deactReason, setDeactReason] = useState('')
  const [grants, setGrants] = useState<Grant[]>([])
  const [grantForm, setGrantForm] = useState({ code: '', manager_name: '', expiry_date: '' })
  const [report, setReport] = useState<{ grantId: string; from: string; to: string; items: any[] }>({ grantId: '', from: '', to: '', items: [] })
  const [reportLoaded, setReportLoaded] = useState(false)

  if (user && user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  const showMsg = (text: string, sev: 'success' | 'error' | 'warning' = 'success') => {
    setMessage(text)
    setMessageSeverity(sev)
  }

  const loadNoms = () => {
    setLoading(true)
    api.get('/nomenclature', { params: { q: nomQ || undefined, limit: 100 } })
      .then((r) => setNoms(r.data.items))
      .catch((e) => showMsg(errorDetail(e), 'error'))
      .finally(() => setLoading(false))
  }
  const loadPackages = () => {
    setLoading(true)
    api.get('/packages', { params: { limit: 100 } })
      .then((r) => setPackages(r.data.items))
      .catch((e) => showMsg(errorDetail(e), 'error'))
      .finally(() => setLoading(false))
  }
  const loadTxs = () => {
    setLoading(true)
    api.get('/transactions', {
      params: { date_from: txFilter.date_from || undefined, date_to: txFilter.date_to || undefined, type: txFilter.type || undefined, limit: 200 },
    })
      .then((r) => setTxs(r.data.items))
      .catch((e) => showMsg(errorDetail(e), 'error'))
      .finally(() => setLoading(false))
  }
  const loadUsers = () => {
    setLoading(true)
    api.get('/users')
      .then((r) => setUsers(r.data))
      .catch((e) => showMsg(errorDetail(e), 'error'))
      .finally(() => setLoading(false))
  }
  const loadGrants = () => {
    setLoading(true)
    api.get('/grants')
      .then((r) => setGrants(r.data))
      .catch((e) => showMsg(errorDetail(e), 'error'))
      .finally(() => setLoading(false))
  }

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
      showMsg('Updated (change logged)')
      loadNoms()
    } catch (err) { showMsg(errorDetail(err), 'error') }
  }

  const createGrant = async () => {
    try {
      await api.post('/grants', grantForm)
      setGrantForm({ code: '', manager_name: '', expiry_date: '' })
      showMsg('Grant created')
      loadGrants()
    } catch (err) { showMsg(errorDetail(err), 'error') }
  }

  const loadReport = async () => {
    if (!report.grantId) return
    setLoading(true)
    try {
      const { data } = await api.get(`/reports/grants/${report.grantId}/consumption`, {
        params: { date_from: report.from || undefined, date_to: report.to || undefined },
      })
      setReport({ ...report, items: data.items })
      setReportLoaded(true)
    } catch (err) { showMsg(errorDetail(err), 'error') }
    finally { setLoading(false) }
  }

  const confirmRoleChange = async () => {
    if (!roleConfirm) return
    try {
      await api.put(`/users/${roleConfirm.user.id}/role`, { role: roleConfirm.newRole })
      showMsg('Role updated')
      setRoleConfirm(null)
      loadUsers()
    } catch (err) { showMsg(errorDetail(err), 'error') }
  }

  const confirmDeactivate = async () => {
    if (!deactConfirm) return
    try {
      await api.put(`/users/${deactConfirm.id}/deactivate`, { reason: deactReason.trim() })
      showMsg('Account deactivated. All sessions revoked.')
      setDeactConfirm(null)
      setDeactReason('')
      loadUsers()
    } catch (err) { showMsg(errorDetail(err), 'error') }
  }

  const reactivateUser = async (u: User) => {
    try {
      await api.put(`/users/${u.id}/reactivate`)
      showMsg('Account reactivated')
      loadUsers()
    } catch (err) { showMsg(errorDetail(err), 'error') }
  }

  const confirmAnonymize = async () => {
    if (!anonymizeConfirm) return
    try {
      await api.post(`/users/${anonymizeConfirm.id}/anonymize`, { reason: anonymizeReason.trim() })
      showMsg('PII removed. Account anonymized, history preserved.')
      setAnonymizeConfirm(null)
      setAnonymizeReason('')
      loadUsers()
    } catch (err) { showMsg(errorDetail(err), 'error') }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5">Admin panel</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable">
        {TABS.map((t) => <Tab key={t} label={t} />)}
      </Tabs>

      {message && <Alert severity={messageSeverity} onClose={() => setMessage(null)}>{message}</Alert>}
      {loading && <Skeleton variant="rounded" height={160} />}

      {tab === 0 && !loading && (
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <TextField label="Search" value={nomQ} onChange={(e) => setNomQ(e.target.value)} sx={{ minWidth: 220 }} />
            <Button variant="outlined" onClick={loadNoms}>Find</Button>
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
                  <TableCell>
                    <Button size="small" onClick={() => { setEditing(n); setEditMode(n.tracking_mode) }}>Edit mode</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Stack>
      )}

      {tab === 1 && !loading && (
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

      {tab === 2 && !loading && (
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <TextField type="date" label="From" InputLabelProps={{ shrink: true }} value={txFilter.date_from} onChange={(e) => setTxFilter({ ...txFilter, date_from: e.target.value })} />
            <TextField type="date" label="To" InputLabelProps={{ shrink: true }} value={txFilter.date_to} onChange={(e) => setTxFilter({ ...txFilter, date_to: e.target.value })} />
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

      {tab === 3 && !loading && (
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
                    onClick={() => setRoleConfirm({ user: u, newRole: u.role === 'admin' ? 'user' : 'admin' })}
                  >
                    {u.role === 'admin' ? 'admin' : 'user'}
                  </Button>
                </TableCell>
                <TableCell>{u.telegram_id ?? '—'}</TableCell>
                <TableCell>{u.accounts_linked ? 'Yes' : '—'}</TableCell>
                <TableCell>
                  <Stack spacing={0.5}>
                    <Typography variant="body2">{u.is_active ? 'Active' : 'Disabled'}</Typography>
                    {u.is_active ? (
                      <Button
                        size="small"
                        color="error"
                        disabled={u.id === user?.id}
                        onClick={() => { setDeactConfirm(u); setDeactReason('') }}
                      >
                        Deactivate
                      </Button>
                    ) : (
                      <Stack spacing={0.5}>
                        <Button size="small" onClick={() => reactivateUser(u)}>Reactivate</Button>
                        {u.pii_removed_at == null && (
                          <Button
                            size="small"
                            color="warning"
                            disabled={u.id === user?.id}
                            onClick={() => { setAnonymizeConfirm(u); setAnonymizeReason('') }}
                          >
                            Remove PII
                          </Button>
                        )}
                      </Stack>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {tab === 4 && !loading && (
        <Stack spacing={2}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Code</TableCell><TableCell>Manager</TableCell><TableCell>Expiry</TableCell><TableCell>Active</TableCell></TableRow></TableHead>
            <TableBody>
              {grants.map((g) => (
                <TableRow key={g.id}>
                  <TableCell>{g.code}</TableCell><TableCell>{g.manager_name}</TableCell>
                  <TableCell>{g.expiry_date ?? '—'}</TableCell>
                  <TableCell>
                    <Button size="small" onClick={async () => { await api.put(`/grants/${g.id}`, { is_active: !g.is_active }); loadGrants() }}>
                      {g.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <TextField label="Code" value={grantForm.code} onChange={(e) => setGrantForm({ ...grantForm, code: e.target.value })} />
            <TextField label="Manager" value={grantForm.manager_name} onChange={(e) => setGrantForm({ ...grantForm, manager_name: e.target.value })} />
            <TextField type="date" label="Expiry" InputLabelProps={{ shrink: true }} value={grantForm.expiry_date} onChange={(e) => setGrantForm({ ...grantForm, expiry_date: e.target.value })} />
            <Button variant="contained" disabled={!grantForm.code || !grantForm.manager_name} onClick={createGrant}>Add grant</Button>
          </Stack>
        </Stack>
      )}

      {tab === 5 && !loading && (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <TextField select label="Grant" value={report.grantId} onChange={(e) => setReport({ ...report, grantId: e.target.value })} sx={{ minWidth: 200 }}>
              {grants.map((g) => <MenuItem key={g.id} value={g.id}>{g.code}</MenuItem>)}
            </TextField>
            <TextField type="date" label="From" InputLabelProps={{ shrink: true }} value={report.from} onChange={(e) => setReport({ ...report, from: e.target.value })} />
            <TextField type="date" label="To" InputLabelProps={{ shrink: true }} value={report.to} onChange={(e) => setReport({ ...report, to: e.target.value })} />
            <Button variant="contained" onClick={loadReport}>Load</Button>
          </Stack>
          {reportLoaded && report.items.length === 0 && (
            <Typography variant="body2" color="text.secondary">No consumption in this period.</Typography>
          )}
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

      <Dialog open={!!deactConfirm} onClose={() => setDeactConfirm(null)} fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Deactivate account
          <IconButton onClick={() => setDeactConfirm(null)} size="small" aria-label="close"><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="warning">
              <b>{deactConfirm?.full_name ?? deactConfirm?.google_email}</b> will lose access immediately.
              The account and all history are kept for accountability.
            </Alert>
            <TextField
              label="Reason *"
              multiline
              minRows={2}
              value={deactReason}
              onChange={(e) => setDeactReason(e.target.value)}
              helperText="Required (min 3 characters). Recorded in the audit log."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button size="large" onClick={() => setDeactConfirm(null)}>Cancel</Button>
          <Button
            size="large"
            color="error"
            variant="contained"
            disabled={deactReason.trim().length < 3}
            onClick={confirmDeactivate}
          >
            Deactivate
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!anonymizeConfirm} onClose={() => setAnonymizeConfirm(null)} fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Remove personal data (GDPR/152-FZ)
          <IconButton onClick={() => setAnonymizeConfirm(null)} size="small" aria-label="close"><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="warning">
              <b>{anonymizeConfirm?.full_name ?? anonymizeConfirm?.google_email}</b> will be anonymized:
              <ul>
                <li>Email, Telegram ID, and full name will be removed</li>
                <li>Account will be permanently deactivated</li>
                <li>Transaction history (write-offs, moves) will be preserved for accountability</li>
                <li>This action cannot be undone</li>
              </ul>
            </Alert>
            <TextField
              label="Reason *"
              multiline
              minRows={2}
              value={anonymizeReason}
              onChange={(e) => setAnonymizeReason(e.target.value)}
              helperText="Required (min 3 characters). Recorded in audit log."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button size="large" onClick={() => setAnonymizeConfirm(null)}>Cancel</Button>
          <Button
            size="large"
            color="warning"
            variant="contained"
            disabled={anonymizeReason.trim().length < 3}
            onClick={confirmAnonymize}
          >
            Remove PII
          </Button>
        </DialogActions>
      </Dialog>

      {/* Подтверждение смены роли */}
      <Dialog open={!!roleConfirm} onClose={() => setRoleConfirm(null)}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Change role
          <IconButton onClick={() => setRoleConfirm(null)} aria-label="close"><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography>
            Change role of <b>{roleConfirm?.user.full_name ?? roleConfirm?.user.google_email}</b> to{' '}
            <b>{roleConfirm?.newRole}</b>?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button size="large" onClick={() => setRoleConfirm(null)}>Cancel</Button>
          <Button size="large" variant="contained" onClick={confirmRoleChange}>Confirm</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!editing} onClose={() => setEditing(null)}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Change tracking mode
          <IconButton onClick={() => setEditing(null)} size="small" aria-label="close"><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent><Stack spacing={2} sx={{ mt: 1 }}>
          <Alert severity="warning">
            Changing the tracking mode affects how write-offs are recorded for <b>{editing?.name}</b>. This change will be logged. Continue?
          </Alert>
          <TextField select label="Tracking mode" value={editMode} onChange={(e) => setEditMode(e.target.value)}>
            <MenuItem value="free">free</MenuItem>
            <MenuItem value="per_unit">per_unit</MenuItem>
            <MenuItem value="by_measure">by_measure</MenuItem>
          </TextField>
          <Button variant="contained" size="large" onClick={saveTrackingMode}>Confirm change</Button>
        </Stack></DialogContent>
      </Dialog>
    </Stack>
  )
}