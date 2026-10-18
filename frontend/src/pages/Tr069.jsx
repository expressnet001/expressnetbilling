import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Plus, RefreshCw, Router, Send, Settings2, Wifi } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';

const emptyChange = () => ({ name: '', value: '', type: 'xsd:string' });

function displayDate(value) {
  if (!value) return 'Never reported';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString();
}

export default function Tr069() {
  const [customers, setCustomers] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [device, setDevice] = useState(null);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingDevice, setLoadingDevice] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('');
  const [changes, setChanges] = useState([emptyChange()]);
  const [error, setError] = useState('');

  const pppoeCustomers = useMemo(
    () => customers.filter((customer) => String(customer.service_type || '').toLowerCase() === 'pppoe'),
    [customers],
  );
  const filteredCustomers = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return pppoeCustomers.filter((customer) => !needle || `${customer.name || ''} ${customer.username || ''} ${customer.router_serial_number || ''}`.toLowerCase().includes(needle));
  }, [filter, pppoeCustomers]);
  const selectedCustomer = pppoeCustomers.find((customer) => String(customer.id) === String(selectedId));
  const linkedCustomers = pppoeCustomers.filter((customer) => customer.router_serial_number);
  const neverSeenCount = pppoeCustomers.length - linkedCustomers.length;

  function focusCustomerPicker() {
    document.getElementById('tr069-customer-picker')?.focus();
    document.getElementById('tr069-device-list')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function focusConfiguration() {
    const target = document.getElementById(device ? 'tr069-configuration' : 'tr069-customer-picker');
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target?.focus();
  }

  async function loadCustomers() {
    setLoadingCustomers(true);
    try {
      const { data } = await api.get('/customers?all=1');
      const rows = Array.isArray(data) ? data : data.results || [];
      setCustomers(rows);
      if (rows.length) {
        const firstPppoe = rows.find((customer) => String(customer.service_type || '').toLowerCase() === 'pppoe');
        setSelectedId((current) => current || String(firstPppoe?.id || ''));
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Could not load PPPoE customers.');
    } finally {
      setLoadingCustomers(false);
    }
  }

  async function loadDevice(customerId = selectedId) {
    if (!customerId) return;
    setLoadingDevice(true);
    setError('');
    setDevice(null);
    try {
      const { data } = await api.get(`/tr069/customers/${encodeURIComponent(customerId)}`);
      setDevice(data.device);
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Could not load the customer router.');
    } finally {
      setLoadingDevice(false);
    }
  }

  useEffect(() => { loadCustomers(); }, []);
  useEffect(() => { if (selectedId) loadDevice(selectedId); else setDevice(null); }, [selectedId]);

  const updateChange = (index, field, value) => {
    setChanges((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));
  };

  async function saveChanges(event) {
    event.preventDefault();
    const parameters = changes.filter((item) => item.name.trim()).map((item) => ({ name: item.name.trim(), value: item.value, type: item.type }));
    if (!parameters.length) {
      toast.error('Choose at least one writable router parameter.');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post(`/tr069/customers/${encodeURIComponent(selectedId)}/configure`, { parameters });
      toast.success(data.message || 'Router configuration queued.');
      setChanges([emptyChange()]);
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || requestError.message || 'Could not queue router configuration.');
    } finally {
      setSaving(false);
    }
  }

  async function runAction(action) {
    if (action === 'reboot' && !window.confirm(`Reboot ${selectedCustomer?.name || 'this customer router'} now?`)) return;
    setSaving(true);
    try {
      const { data } = await api.post(`/tr069/customers/${encodeURIComponent(selectedId)}/${action}`);
      toast.success(data.message || (action === 'reboot' ? 'Router reboot queued.' : 'Refresh queued.'));
      if (action === 'refresh') window.setTimeout(() => loadDevice(selectedId), 1800);
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || requestError.message || 'Router action failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tr069-console space-y-4">
      <header className="tr069-heading">
        <div>
          <div className="tr069-breadcrumb">NETWORK <span>—</span> TR-069</div>
          <h1>TR-069 <em>devices.</em></h1>
          <p>Your subscribers’ ONTs and routers. Changes apply when a device next checks in.</p>
        </div>
        <div className="tr069-heading-actions">
          <button type="button" className="tr069-login-button" onClick={focusConfiguration}><KeyRound size={14} />Network login</button>
          <button type="button" className="tr069-enrol-button" onClick={focusCustomerPicker}><Plus size={14} />Enrol device</button>
        </div>
      </header>

      <section className="tr069-stats" aria-label="TR-069 device summary">
        <div><span>DEVICES</span><strong>{linkedCustomers.length}</strong></div>
        <div title="The selected customer's router currently loaded from the ACS"><span>CHECKED IN</span><strong>{device ? 1 : 0}</strong></div>
        <div><span>NOT ANSWERING</span><strong>0</strong></div>
        <div><span>NEVER SEEN</span><strong>{neverSeenCount}</strong><small>Awaiting first check-in</small></div>
      </section>

      <nav className="tr069-filters" aria-label="Device status filters">
        <button type="button" className="active">All <b>{pppoeCustomers.length}</b></button>
        <button type="button" onClick={() => selectedId && loadDevice(selectedId)}>Not answering <b>0</b></button>
        <button type="button" onClick={focusCustomerPicker}>Never seen <b>{neverSeenCount}</b></button>
        <button type="button" onClick={() => selectedId && loadDevice(selectedId)}>Weak signal <b>0</b></button>
      </nav>

      <section id="tr069-device-list" className="tr069-table-shell">
        <div className="tr069-table-scroll"><table className="tr069-device-table"><thead><tr><th><input type="checkbox" aria-label="Select all devices" disabled /></th><th>DEVICE</th><th>SUBSCRIBER</th><th>MODEL</th><th>SIGNAL</th><th>STATUS</th><th>LAST CHECK-IN</th></tr></thead>
          <tbody>{pppoeCustomers.length ? pppoeCustomers.map((customer) => {
            const isSelected = String(customer.id) === String(selectedId);
            const hasSerial = Boolean(customer.router_serial_number);
            return <tr key={customer.id} className={isSelected ? 'selected' : ''} onClick={() => setSelectedId(String(customer.id))}>
              <td><input type="radio" name="tr069-device" checked={isSelected} onChange={() => setSelectedId(String(customer.id))} aria-label={`Select ${customer.name || customer.username}`} /></td>
              <td><span className="tr069-device-name"><Router size={14} />{customer.router_serial_number || 'No serial linked'}</span></td>
              <td>{customer.name || customer.username || 'PPPoE customer'}<small>{customer.username || 'No PPPoE username'}</small></td>
              <td>{isSelected && device ? `${device.manufacturer || ''} ${device.model || ''}`.trim() || 'Router' : '—'}</td>
              <td>—</td>
              <td><span className={`tr069-status ${hasSerial ? (isSelected && device ? 'online' : 'pending') : 'offline'}`}>{hasSerial ? (isSelected && device ? 'Checked in' : 'Linked') : 'Never seen'}</span></td>
              <td>{isSelected && device ? displayDate(device.last_inform) : '—'}</td>
            </tr>;
          }) : <tr><td colSpan="7" className="tr069-empty">{loadingCustomers ? 'Loading PPPoE subscribers…' : 'No PPPoE subscribers found.'}</td></tr>}</tbody>
        </table></div>
      </section>

      <section className="tr069-picker">
        <div className="tr069-picker-copy"><h2>Customer router controls</h2><p>Select a PPPoE subscriber to inspect and configure their router through the ACS.</p></div>
        <div className="tr069-picker-fields">
          <label className="form-label">PPPoE customer
            <select id="tr069-customer-picker" className="form-input" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={loadingCustomers}>
              <option value="">Select a PPPoE customer</option>
              {filteredCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name || customer.username} · {customer.username || 'No username'}</option>)}
            </select>
          </label>
          <label className="form-label">Filter customers
            <input className="form-input" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Name, PPPoE username, or router serial" />
          </label>
        </div>
        {selectedCustomer && <p className="theme-muted mt-3 text-xs">Router serial: <span className="theme-text font-medium">{selectedCustomer.router_serial_number || 'Not set on this customer'}</span></p>}
      </section>

      {error && <div className="tr069-message tr069-error">{error}</div>}
      {loadingDevice && <div className="tr069-message">Connecting to the TR-069 ACS…</div>}

      {device && (
        <>
          <section className="theme-card rounded-lg border p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md" style={{ color: 'var(--app-accent)', background: 'var(--app-accent-muted)' }}><Router size={20} /></span>
                <div>
                  <h2 className="theme-text text-base font-semibold">{device.manufacturer || 'Customer router'} {device.model}</h2>
                  <p className="theme-muted mt-1 text-xs">Serial {device.serial_number || device.device_id} · Last inform {displayDate(device.last_inform)}</p>
                  <p className="theme-muted mt-1 text-[11px]">Customer: {selectedCustomer?.name || selectedCustomer?.username} ({selectedCustomer?.username})</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary" onClick={() => runAction('refresh')} disabled={saving}><RefreshCw size={14} />Refresh parameters</button>
                <button type="button" className="btn-secondary" onClick={() => runAction('reboot')} disabled={saving}><Wifi size={14} />Reboot router</button>
              </div>
            </div>
          </section>

          <section className="theme-card overflow-hidden rounded-lg border">
            <div className="theme-card-muted flex items-center justify-between border-b px-4 py-3">
              <div><h2 className="theme-text text-sm font-semibold">Reported router parameters</h2><p className="theme-muted mt-1 text-xs">Sensitive values such as passwords are hidden. Only parameters reported writable by this router can be changed.</p></div>
              <span className="theme-muted text-xs">{device.parameters.length} parameters</span>
            </div>
            <div className="max-h-[360px] overflow-auto">
              {device.parameters.length ? <table className="min-w-full"><thead><tr><th className="px-4 py-2 text-left">Parameter</th><th className="px-4 py-2 text-left">Current value</th><th className="px-4 py-2 text-left">Access</th></tr></thead><tbody className="divide-y divide-slate-200">
                {device.parameters.map((parameter) => <tr key={parameter.name}><td className="table-cell max-w-[520px] whitespace-normal break-all font-mono text-[11px]">{parameter.name}</td><td className="table-cell max-w-sm whitespace-normal break-all">{parameter.value === null || parameter.value === undefined ? '—' : String(parameter.value)}</td><td className="table-cell">{parameter.writable ? 'Writable' : 'Read only'}</td></tr>)}
              </tbody></table> : <p className="theme-muted p-5 text-sm">No parameter values have been reported yet. Request a refresh and try again after the router checks in.</p>}
            </div>
          </section>

          <section id="tr069-configuration" className="theme-card rounded-lg border p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2"><Settings2 size={17} style={{ color: 'var(--app-accent)' }} /><div><h2 className="theme-text text-sm font-semibold">Configure router</h2><p className="theme-muted mt-1 text-xs">Select a writable parameter path and queue its new value to the customer's router.</p></div></div>
            <datalist id="tr069-writable-parameters">{device.writable_parameters.map((name) => <option key={name} value={name} />)}</datalist>
            <form onSubmit={saveChanges} className="space-y-3">
              {changes.map((change, index) => <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_150px_auto]">
                <input className="form-input mt-0" list="tr069-writable-parameters" value={change.name} onChange={(event) => updateChange(index, 'name', event.target.value)} placeholder="TR-069 parameter path" aria-label="Parameter path" />
                <input className="form-input mt-0" value={change.value} onChange={(event) => updateChange(index, 'value', event.target.value)} placeholder="New value" aria-label="New parameter value" />
                <select className="form-input mt-0" value={change.type} onChange={(event) => updateChange(index, 'type', event.target.value)} aria-label="Parameter value type"><option value="xsd:string">Text</option><option value="xsd:boolean">Boolean</option><option value="xsd:int">Integer</option><option value="xsd:unsignedInt">Unsigned integer</option></select>
                <button type="button" className="btn-secondary" onClick={() => setChanges((current) => current.length === 1 ? [emptyChange()] : current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
              </div>)}
              <div className="flex flex-wrap justify-between gap-2">
                <button type="button" className="btn-secondary" onClick={() => setChanges((current) => [...current, emptyChange()])}>Add parameter</button>
                <button type="submit" className="btn-primary" disabled={saving}><Send size={14} />{saving ? 'Sending…' : 'Apply configuration'}</button>
              </div>
            </form>
          </section>
        </>
      )}
      <footer className="tr069-footer">© 2023–2026 CENTIPID TECHNOLOGIES</footer>
    </div>
  );
}
