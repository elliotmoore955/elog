/* Engineering Shift Log — all data is kept in this browser's localStorage. */
(() => {
'use strict';

const STORE = 'shiftlog.entries.v1';
const SETTINGS = 'shiftlog.settings.v1';

const DEFAULT_SYSTEMS = `# Communications
VCS (voice comms)
VHF main
VHF standby
VHF emergency (121.5)
UHF
Voice recorder
Telephones / intercom
# Navigation
ILS localiser
ILS glidepath
DME
NDB
# Surveillance
Primary radar (PSR)
Secondary radar (SSR)
ADS-B / multilateration
Radar display / ATM
# Data
Flight data processing
ATIS
AFTN / AMHS
Met display
Time server / clocks
# Power & infrastructure
UPS
Standby generator
HVAC / equipment room
Network / LAN
Lighting interface`;

const TYPE_LABEL = {
  handover: 'Shift handover', 'key-out': 'Key out', 'key-in': 'Key in',
  info: 'Info', event: 'Event', fault: 'Fault', maintenance: 'Maintenance'
};
const TYPE_COLOUR = {
  handover: 'var(--accent)', 'key-out': 'var(--med)', 'key-in': 'var(--ok)',
  info: 'var(--low)', event: 'var(--ink)', fault: 'var(--fault)', maintenance: 'var(--maint)'
};
const SEV_LABEL = { low: 'Low', medium: 'Medium', high: 'High' };

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = n => String(n).padStart(2, '0');
const hhmm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
const toLocalInput = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${hhmm(d)}`;
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDay = d => {
  const today = new Date(), y = new Date(); y.setDate(today.getDate() - 1);
  const base = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (dayKey(d) === dayKey(today)) return 'Today · ' + base;
  if (dayKey(d) === dayKey(y)) return 'Yesterday · ' + base;
  return base;
};
const fmtShort = d => {
  const same = dayKey(d) === dayKey(new Date());
  return same ? hhmm(d) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + hhmm(d);
};
const fmtDur = m => {
  m = Math.round(m);
  const h = Math.floor(m / 60), r = m % 60;
  if (!h) return r + ' min';
  return r ? `${h} h ${r} min` : (h === 1 ? '1 hour' : h + ' hours');
};
const since = d => {
  const m = Math.max(0, Math.round((Date.now() - d) / 60000));
  return m < 60 ? m + ' min' : fmtDur(m).replace(' hours', ' h').replace(' hour', ' h');
};

function readJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; }
}
function writeJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch { toast('Could not save — browser storage is full or blocked'); return false; }
}

/* ---------- state ---------- */
let entries = readJSON(STORE, []);
if (!Array.isArray(entries)) entries = [];
let settings = Object.assign({ name: '', systems: DEFAULT_SYSTEMS, tab: 'admin' }, readJSON(SETTINGS, {}));
const editing = { admin: null, tech: null };
const filters = { admin: { q: '', type: '' }, tech: { q: '', type: '', system: '', open: false } };

const save = () => writeJSON(STORE, entries);
const saveSettings = () => writeJSON(SETTINGS, settings);

function parseSystems(text) {
  const groups = []; let cur = null;
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) { cur = { name: line.replace(/^#+/, '').trim() || 'Other', items: [] }; groups.push(cur); continue; }
    if (!cur) { cur = { name: 'Systems', items: [] }; groups.push(cur); }
    cur.items.push(line);
  }
  return groups;
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ---------- tabs ---------- */
function setTab(tab) {
  settings.tab = tab; saveSettings();
  $$('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $('#panel-admin').hidden = tab !== 'admin';
  $('#panel-tech').hidden = tab !== 'tech';
}
$$('.tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));

/* ---------- forms ---------- */
const forms = { admin: $('#form-admin'), tech: $('#form-tech') };

function fillSystemSelects() {
  const groups = parseSystems(settings.systems);
  const used = new Set(entries.filter(e => e.section === 'tech' && e.system).map(e => e.system));
  const listed = new Set(groups.flatMap(g => g.items));
  const extra = [...used].filter(s => !listed.has(s)).sort();

  const opts = groups.map(g => `<optgroup label="${esc(g.name)}">${g.items.map(i => `<option>${esc(i)}</option>`).join('')}</optgroup>`).join('')
    + (extra.length ? `<optgroup label="Previously logged">${extra.map(i => `<option>${esc(i)}</option>`).join('')}</optgroup>` : '');

  const sel = forms.tech.elements.system, prev = sel.value;
  sel.innerHTML = `<option value="">Select system…</option>${opts}<option value="__other">Other…</option><option value="__none">Not system-specific</option>`;
  if ([...sel.options].some(o => o.value === prev)) sel.value = prev;

  const fsel = $('#panel-tech [data-f=system]'), fprev = fsel.value;
  const all = [...listed, ...extra];
  fsel.innerHTML = '<option value="">All systems</option>' + all.map(i => `<option>${esc(i)}</option>`).join('');
  if (all.includes(fprev)) fsel.value = fprev;
}

function fillKeyList() {
  const keys = [...new Set(entries.filter(e => e.key).map(e => e.key))].sort();
  $('#key-list').innerHTML = keys.map(k => `<option value="${esc(k)}">`).join('');
}

function syncForm(section) {
  const f = forms[section], el = f.elements, type = el.type.value;
  $$('[data-types]', f).forEach(n => { n.hidden = !n.dataset.types.split(' ').includes(type); });
  el.when.hidden = el.whenMode.value !== 'set';

  if (section === 'admin') {
    $('[data-keylabel]', f).textContent = type === 'key-in' ? 'Returned by' : 'Issued to';
    el.notes.placeholder = type === 'handover' ? el.notes.dataset.phHandover : '';
  } else {
    $('[data-other]', f).hidden = el.system.value !== '__other';
    $('[data-whenlabel]', f).textContent = type === 'maintenance' ? 'Start time' : 'Time';
    $('[data-custom-dur]', f).hidden = el.duration.value !== 'custom';
    if (type === 'maintenance') {
      const mins = durationOf(f);
      const start = el.whenMode.value === 'set' && el.when.value ? new Date(el.when.value) : new Date();
      const end = new Date(start.getTime() + mins * 60000);
      $('[data-ends]', f).textContent = mins > 0 ? `${fmtDur(mins)} · ends ${fmtShort(end)}${dayKey(end) !== dayKey(start) && dayKey(start) === dayKey(new Date()) ? ' (next day)' : ''}` : 'Set a duration';
    }
  }
}

function durationOf(f) {
  const el = f.elements;
  if (el.duration.value !== 'custom') return Number(el.duration.value);
  return (Number(el.durH.value) || 0) * 60 + (Number(el.durM.value) || 0);
}

function resetForm(section, keepType) {
  const f = forms[section], el = f.elements;
  const type = keepType ? el.type.value : null;
  f.reset();
  if (type) [...el.type].forEach(r => { r.checked = r.value === type; });
  el.loggedBy.value = settings.name || '';
  el.when.value = toLocalInput(new Date());
  editing[section] = null;
  f.classList.remove('editing');
  $('[data-title]', f).textContent = section === 'admin' ? 'New admin entry' : 'New fault / maintenance entry';
  $('[data-submit]', f).textContent = 'Log entry';
  $('[data-cancel]', f).hidden = true;
  $('.form-error', f).hidden = true;
  syncForm(section);
}

function showError(f, msg) { const p = $('.form-error', f); p.textContent = msg; p.hidden = false; }

for (const section of ['admin', 'tech']) {
  const f = forms[section];
  f.addEventListener('input', () => syncForm(section));
  f.addEventListener('change', e => {
    if (e.target.name === 'whenMode' && e.target.value === 'set' && !f.elements.when.value) f.elements.when.value = toLocalInput(new Date());
    syncForm(section);
  });
  $('[data-cancel]', f).addEventListener('click', () => resetForm(section));
  f.addEventListener('submit', e => { e.preventDefault(); submit(section); });
}

function submit(section) {
  const f = forms[section], el = f.elements, type = el.type.value;
  $('.form-error', f).hidden = true;

  let time;
  if (el.whenMode.value === 'set') {
    if (!el.when.value) return showError(f, 'Enter the date and time, or choose Now.');
    time = new Date(el.when.value);
    if (isNaN(time)) return showError(f, 'That date and time is not valid.');
  } else {
    time = new Date();
  }

  const old = editing[section] ? entries.find(x => x.id === editing[section]) : null;
  const e = Object.assign({}, old || {}, {
    id: old ? old.id : uid(),
    section, type,
    time: time.toISOString(),
    notes: el.notes.value.trim(),
    loggedBy: el.loggedBy.value.trim(),
    updatedAt: new Date().toISOString()
  });
  if (!old) e.createdAt = e.updatedAt;
  if (!e.loggedBy) return showError(f, 'Add your name in “Logged by”.');

  if (section === 'admin') {
    for (const k of ['outgoing', 'incoming', 'key', 'keyHolder', 'summary']) delete e[k];
    if (type === 'handover') {
      e.outgoing = el.outgoing.value.trim(); e.incoming = el.incoming.value.trim();
      if (!e.outgoing && !e.incoming) return showError(f, 'Add the outgoing or incoming engineer.');
      if (!e.notes) return showError(f, 'Add handover notes.');
    } else if (type === 'key-out' || type === 'key-in') {
      e.key = el.key.value.trim(); e.keyHolder = el.keyHolder.value.trim();
      if (!e.key) return showError(f, 'Which key?');
      if (!e.keyHolder) return showError(f, type === 'key-out' ? 'Who is the key issued to?' : 'Who returned the key?');
      if (type === 'key-out' && !old) e.status = 'open';
      if (type === 'key-in') delete e.status;
    } else {
      e.summary = el.summary.value.trim();
      if (!e.summary && !e.notes) return showError(f, 'Add a summary or notes.');
    }
  } else {
    for (const k of ['system', 'severity', 'status', 'durationMin', 'offline', 'ref', 'summary']) delete e[k];
    let sys = el.system.value;
    if (sys === '__other') {
      sys = el.systemOther.value.trim();
      if (!sys) return showError(f, 'Type the name of the system.');
    } else if (sys === '__none') sys = '';
    else if (!sys && (type === 'fault' || type === 'maintenance')) return showError(f, 'Select the system.');
    e.system = sys;
    e.summary = el.summary.value.trim();
    if (!e.summary) return showError(f, 'Add a summary.');
    if (type === 'fault' || type === 'maintenance') e.ref = el.ref.value.trim();
    if (type === 'fault') {
      e.severity = el.severity.value;
      e.status = el.status.value;
      if (e.status === 'closed' && !e.closedAt) e.closedAt = new Date().toISOString();
      if (e.status === 'open') delete e.closedAt;
    }
    if (type === 'maintenance') {
      e.durationMin = durationOf(f);
      if (!(e.durationMin > 0)) return showError(f, 'Set a duration.');
      e.offline = el.offline.checked;
    }
  }

  if (old) entries[entries.indexOf(old)] = e; else entries.push(e);

  // A key returned closes the matching key-out entry
  if (e.type === 'key-in' && !old) {
    const match = entries.filter(x => x.type === 'key-out' && x.status === 'open' && x.key.toLowerCase() === e.key.toLowerCase())
      .sort((a, b) => b.time.localeCompare(a.time))[0];
    if (match) { match.status = 'closed'; match.returnedAt = e.time; match.returnedBy = e.keyHolder; }
  }

  settings.name = e.loggedBy; saveSettings();
  for (const s of ['admin', 'tech']) if (s !== section && !editing[s] && !forms[s].elements.loggedBy.value) forms[s].elements.loggedBy.value = e.loggedBy;
  if (!save()) return;
  toast(old ? 'Entry updated' : 'Logged');
  resetForm(section, true);
  renderAll();
}

function loadIntoForm(e) {
  const section = e.section, f = forms[section], el = f.elements;
  setTab(section);
  resetForm(section);
  [...el.type].forEach(r => { r.checked = r.value === e.type; });
  [...el.whenMode].forEach(r => { r.checked = r.value === 'set'; });
  el.when.value = toLocalInput(new Date(e.time));
  el.notes.value = e.notes || '';
  el.loggedBy.value = e.loggedBy || '';
  if (section === 'admin') {
    el.outgoing.value = e.outgoing || ''; el.incoming.value = e.incoming || '';
    el.key.value = e.key || ''; el.keyHolder.value = e.keyHolder || '';
    el.summary.value = e.summary || '';
  } else {
    const sel = el.system;
    if (!e.system) sel.value = '__none';
    else if ([...sel.options].some(o => o.value === e.system)) sel.value = e.system;
    else { sel.value = '__other'; el.systemOther.value = e.system; }
    el.summary.value = e.summary || '';
    el.ref.value = e.ref || '';
    if (e.severity) el.severity.value = e.severity;
    if (e.status) el.status.value = e.status;
    if (e.durationMin) {
      const preset = [...el.duration.options].some(o => o.value === String(e.durationMin));
      el.duration.value = preset ? String(e.durationMin) : 'custom';
      el.durH.value = Math.floor(e.durationMin / 60); el.durM.value = e.durationMin % 60;
    }
    el.offline.checked = !!e.offline;
  }
  editing[section] = e.id;
  f.classList.add('editing');
  $('[data-title]', f).textContent = 'Edit entry';
  $('[data-submit]', f).textContent = 'Save changes';
  $('[data-cancel]', f).hidden = false;
  syncForm(section);
  f.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.summary && !el.summary.closest('[hidden]') ? el.summary.focus({ preventScroll: true }) : el.notes.focus({ preventScroll: true });
}

/* ---------- log rendering ---------- */
function matches(e, flt) {
  if (flt.type && e.type !== flt.type) return false;
  if (flt.system && e.system !== flt.system) return false;
  if (flt.open && !(e.type === 'fault' && e.status === 'open')) return false;
  if (flt.q) {
    const hay = [TYPE_LABEL[e.type], e.system, e.summary, e.notes, e.ref, e.key, e.keyHolder, e.outgoing, e.incoming, e.loggedBy].join(' ').toLowerCase();
    if (!flt.q.toLowerCase().split(/\s+/).every(w => hay.includes(w))) return false;
  }
  return true;
}

function entryHTML(e) {
  const t = new Date(e.time);
  const badges = [`<span class="badge" style="--c:${TYPE_COLOUR[e.type]}">${esc(TYPE_LABEL[e.type] || e.type)}</span>`];
  let title = '', extra = [], acts = [];

  if (e.type === 'fault') {
    badges.push(`<span class="badge" style="--c:${e.severity === 'high' ? 'var(--fault)' : e.severity === 'medium' ? 'var(--med)' : 'var(--low)'}">${esc(SEV_LABEL[e.severity] || '')}</span>`);
    badges.push(e.status === 'open' ? `<span class="badge" style="--c:var(--fault)">Open</span>` : `<span class="badge" style="--c:var(--ok)">Cleared${e.closedAt ? ' ' + esc(fmtShort(new Date(e.closedAt))) : ''}</span>`);
    acts.push(e.status === 'open' ? `<button class="act" data-act="close">Mark cleared</button>` : `<button class="act" data-act="reopen">Reopen</button>`);
  }
  if (e.type === 'maintenance') {
    const end = new Date(t.getTime() + e.durationMin * 60000), now = Date.now();
    const state = now < t ? ['Planned', 'var(--accent)'] : now < end ? ['In progress', 'var(--maint)'] : ['Complete', 'var(--ok)'];
    badges.push(`<span class="badge" style="--c:${state[1]}">${state[0]}</span>`);
    extra.push(`${esc(fmtDur(e.durationMin))} · ${esc(hhmm(t))}–${esc(fmtShort(end))}${e.offline ? ' · system out of service' : ''}`);
  }
  if (e.system) badges.push(`<span class="sys">${esc(e.system)}</span>`);

  if (e.type === 'handover') title = `${e.outgoing || '—'} → ${e.incoming || '—'}`;
  else if (e.type === 'key-out') {
    title = `${e.key} issued to ${e.keyHolder}`;
    if (e.status === 'open') { badges.push(`<span class="badge" style="--c:var(--med)">Out</span>`); acts.push(`<button class="act" data-act="return">Log return</button>`); }
    else badges.push(`<span class="badge" style="--c:var(--ok)">Returned${e.returnedAt ? ' ' + esc(fmtShort(new Date(e.returnedAt))) : ''}</span>`);
  }
  else if (e.type === 'key-in') title = `${e.key} returned by ${e.keyHolder}`;
  else title = e.summary || '';

  acts.push(`<button class="act" data-act="edit">Edit</button>`, `<button class="act danger" data-act="delete">Delete</button>`);
  const by = [e.loggedBy && 'Logged by ' + e.loggedBy, e.ref && 'Ref ' + e.ref].filter(Boolean).map(esc).join(' · ');
  const cls = ['entry', 't-' + e.type, e.severity ? 'sev-' + e.severity : '', e.type === 'fault' && e.status === 'closed' ? 'closed' : ''].join(' ');

  return `<article class="${cls}" data-id="${esc(e.id)}">
    <time datetime="${esc(e.time)}">${esc(hhmm(t))}</time>
    <div>
      <div class="meta">${badges.join('')}</div>
      ${title ? `<h3>${esc(title)}</h3>` : ''}
      ${extra.map(x => `<p class="by">${x}</p>`).join('')}
      ${e.notes ? `<p>${esc(e.notes)}</p>` : ''}
      ${by ? `<p class="by">${by}</p>` : ''}
    </div>
    <div class="acts">${acts.join('')}</div>
  </article>`;
}

function renderLog(section) {
  const panel = $('#panel-' + section), list = $('[data-list]', panel);
  const all = entries.filter(e => e.section === section);
  const rows = all.filter(e => matches(e, filters[section])).sort((a, b) => b.time.localeCompare(a.time));
  if (!rows.length) {
    list.innerHTML = `<div class="empty">${all.length ? 'No entries match these filters.' : 'Nothing logged yet. Use the form to add the first entry.'}</div>`;
    return;
  }
  let html = '', lastDay = '';
  for (const e of rows) {
    const d = new Date(e.time), k = dayKey(d);
    if (k !== lastDay) { html += `<h3 class="day">${esc(fmtDay(d))}</h3>`; lastDay = k; }
    html += entryHTML(e);
  }
  list.innerHTML = html;
}

function renderSummary() {
  const keysOut = entries.filter(e => e.type === 'key-out' && e.status === 'open').sort((a, b) => a.time.localeCompare(b.time));
  const faults = entries.filter(e => e.type === 'fault' && e.status === 'open')
    .sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] - { high: 0, medium: 1, low: 2 }[b.severity]) || b.time.localeCompare(a.time));
  const now = Date.now(), day = 24 * 3600e3;
  const maint = entries.filter(e => e.type === 'maintenance').map(e => {
    const s = new Date(e.time).getTime(); return { e, s, end: s + e.durationMin * 60000 };
  }).filter(m => m.end > now && m.s < now + day).sort((a, b) => a.s - b.s);
  const active = maint.filter(m => m.s <= now);

  const list = (items, fn) => `<ul class="sum-list">${items.slice(0, 4).map(fn).join('')}</ul>${items.length > 4 ? `<p class="hint">+${items.length - 4} more</p>` : ''}`;

  $('#sum-keys .sum-body').innerHTML = keysOut.length
    ? `<div class="sum-big">${keysOut.length}</div>` + list(keysOut, e => `<li><span>${esc(e.key)} — ${esc(e.keyHolder)}</span><span class="t">${esc(since(new Date(e.time)))}</span></li>`)
    : `<p class="sum-empty">All keys in.</p>`;

  $('#sum-faults .sum-body').innerHTML = faults.length
    ? `<div class="sum-big">${faults.length}</div>` + list(faults, e => `<li><span>${esc(e.system || 'General')} — ${esc(e.summary)}</span><span class="t">${esc(SEV_LABEL[e.severity] || '')}</span></li>`)
    : `<p class="sum-empty">No open faults.</p>`;

  $('#sum-maint .sum-body').innerHTML = maint.length
    ? `<div class="sum-big">${active.length} <span class="hint">in progress</span></div>` + list(maint, m => `<li><span>${esc(m.e.system || 'General')} — ${esc(m.e.summary)}</span><span class="t">${m.s <= now ? 'until ' + esc(fmtShort(new Date(m.end))) : 'from ' + esc(fmtShort(new Date(m.s)))}</span></li>`)
    : `<p class="sum-empty">None in progress or due in the next 24 h.</p>`;
}

function renderAll() {
  fillSystemSelects(); fillKeyList();
  renderSummary(); renderLog('admin'); renderLog('tech');
}

/* ---------- filters ---------- */
for (const section of ['admin', 'tech']) {
  $$('#panel-' + section + ' [data-f]').forEach(inp => {
    inp.addEventListener(inp.type === 'search' ? 'input' : 'change', () => {
      filters[section][inp.dataset.f] = inp.type === 'checkbox' ? inp.checked : inp.value;
      renderLog(section);
    });
  });
}

/* ---------- entry actions ---------- */
const pendingDelete = new Map();
document.addEventListener('click', ev => {
  const btn = ev.target.closest('[data-act]'); if (!btn) return;
  const id = btn.closest('[data-id]').dataset.id, e = entries.find(x => x.id === id); if (!e) return;
  const act = btn.dataset.act;

  if (act === 'edit') return loadIntoForm(e);
  if (act === 'delete') {
    if (!pendingDelete.has(id)) {
      btn.textContent = 'Confirm delete'; btn.classList.add('confirm');
      pendingDelete.set(id, setTimeout(() => { pendingDelete.delete(id); btn.textContent = 'Delete'; btn.classList.remove('confirm'); }, 4000));
      return;
    }
    clearTimeout(pendingDelete.get(id)); pendingDelete.delete(id);
    entries = entries.filter(x => x.id !== id);
    if (editing[e.section] === id) resetForm(e.section);
    save(); renderAll(); toast('Entry deleted');
    return;
  }
  if (act === 'close') { e.status = 'closed'; e.closedAt = new Date().toISOString(); }
  if (act === 'reopen') { e.status = 'open'; delete e.closedAt; }
  if (act === 'return') {
    const f = forms.admin; resetForm('admin');
    [...f.elements.type].forEach(r => { r.checked = r.value === 'key-in'; });
    f.elements.key.value = e.key; f.elements.keyHolder.value = e.keyHolder;
    syncForm('admin'); setTab('admin');
    f.scrollIntoView({ behavior: 'smooth', block: 'start' });
    f.elements.keyHolder.focus({ preventScroll: true });
    return toast('Check the name and press Log entry');
  }
  e.updatedAt = new Date().toISOString();
  save(); renderAll();
});

/* ---------- settings & data ---------- */
const dlg = $('#settings');
$('#btn-settings').addEventListener('click', () => {
  $('#set-name').value = settings.name || '';
  $('#set-daily').checked = settings.daily !== false;
  $('#set-systems').value = settings.systems;
  $('#data-count').textContent = `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} saved in this browser.`;
  dlg.showModal();
});
$('#save-settings').addEventListener('click', () => {
  settings.name = $('#set-name').value.trim();
  settings.systems = $('#set-systems').value.trim() || DEFAULT_SYSTEMS;
  saveSettings();
  for (const s of ['admin', 'tech']) if (!editing[s]) forms[s].elements.loggedBy.value = settings.name;
  renderAll(); dlg.close(); toast('Settings saved');
});
$('#reset-systems').addEventListener('click', () => { $('#set-systems').value = DEFAULT_SYSTEMS; });

function download(name, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const stamp = () => dayKey(new Date()) + '_' + hhmm(new Date()).replace(':', '');

$('#export-json').addEventListener('click', () => {
  download(`shift-log-backup_${stamp()}.json`, JSON.stringify({ app: 'shift-log', version: 1, exported: new Date().toISOString(), entries }, null, 2), 'application/json');
});
$('#export-csv').addEventListener('click', () => {
  const cols = [['Date/time', e => toLocalInput(new Date(e.time)).replace('T', ' ')], ['Section', e => e.section === 'admin' ? 'Admin' : 'Faults & maintenance'],
    ['Type', e => TYPE_LABEL[e.type]], ['System', e => e.system], ['Summary', e => e.summary], ['Notes', e => e.notes],
    ['Severity', e => SEV_LABEL[e.severity]], ['Status', e => e.status], ['Duration (min)', e => e.durationMin], ['Out of service', e => e.offline ? 'Yes' : ''],
    ['Key', e => e.key], ['Key holder', e => e.keyHolder], ['Outgoing', e => e.outgoing], ['Incoming', e => e.incoming],
    ['Reference', e => e.ref], ['Logged by', e => e.loggedBy]];
  const cell = v => { v = v == null ? '' : String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const rows = [...entries].sort((a, b) => a.time.localeCompare(b.time));
  download(`shift-log_${stamp()}.csv`, '﻿' + [cols.map(c => c[0]).join(','), ...rows.map(e => cols.map(c => cell(c[1](e))).join(','))].join('\r\n'), 'text/csv');
});
$('#import-json').addEventListener('change', async ev => {
  const file = ev.target.files[0]; ev.target.value = ''; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming = Array.isArray(data) ? data : data.entries;
    if (!Array.isArray(incoming)) throw new Error('bad');
    const valid = incoming.filter(e => e && typeof e.id === 'string' && typeof e.time === 'string' && TYPE_LABEL[e.type] && (e.section === 'admin' || e.section === 'tech'));
    const byId = new Map(entries.map(e => [e.id, e]));
    let added = 0, updated = 0;
    for (const e of valid) {
      const cur = byId.get(e.id);
      if (!cur) { byId.set(e.id, e); added++; }
      else if ((e.updatedAt || '') > (cur.updatedAt || '')) { byId.set(e.id, e); updated++; }
    }
    entries = [...byId.values()]; save(); renderAll();
    $('#data-count').textContent = `${entries.length} entries saved in this browser.`;
    toast(`Imported: ${added} new, ${updated} updated`);
  } catch { toast('That file is not a shift log backup'); }
});

/* ---------- message of the day ---------- */
const MESSAGES = [
  'Every fault you log today is a lesson someone else won\'t have to learn the hard way.',
  'Calm is a skill. Practise it on the quiet shifts so it\'s there on the busy ones.',
  'The best handover is the one where nobody has to ring you afterwards.',
  'Good engineers fix problems. Great ones write down how they did it.',
  'Small checks, done properly, keep big things from going wrong.',
  'You don\'t have to know everything. You just have to know where to look and who to ask.',
  'Somewhere up there, a pilot is trusting kit you looked after today.',
  'Slow is smooth, and smooth is fast.',
  'Curiosity is the most useful tool in the toolbox.',
  'A clear note now saves an hour of head-scratching later.',
  'Progress isn\'t always loud. Sometimes it\'s just one more thing you understand today.',
  'Ask the question. Someone else on shift is probably wondering the same thing.',
  'Leave every system, and every logbook, a little better than you found it.',
  'Confidence comes from preparation. Preparation comes from today.',
  'Nobody notices when everything just works, and that\'s the whole point.',
  'The fault that\'s hardest to find teaches you the most.',
  'Look after the basics and the basics will look after you.',
  'Every expert on the team was once the trainee asking "why?".',
  'Trust the procedure, but understand the reason behind it.',
  'A good shift is not one with no problems. It\'s one where problems are handled well.',
  'Take the extra minute. It\'s nearly always worth it.',
  'Your future self will thank you for today\'s tidy notes.',
  'Be the engineer you\'d want on the other end of the phone at 3 a.m.',
  'One step at a time still gets you all the way there.',
  'Stay curious, stay careful, stay kind.',
  'Every system has a story. Read the logs.',
  'Today is a good day to learn something you\'ve been putting off.',
  'Steady hands, clear head, good coffee.',
  'Quiet competence is still competence.',
  'Mistakes are data. Log them, learn from them, move on.',
  'Teamwork is just good communication, repeated.',
  'Find the root cause, not just the quickest fix.',
  'You are building experience that no textbook can give you.',
  'Done properly beats done quickly.',
  'If something doesn\'t look right, it\'s worth a second look.',
  'Your attention to detail keeps the sky running smoothly.',
  'Share what you know. It makes the whole team stronger.',
  'Hard days build the skills that make the easy days easy.',
  'There\'s no such thing as a silly question when safety is involved.',
  'Be patient with the kit, with your colleagues and with yourself.',
  'Every day on shift is a day closer to where you\'re heading.',
  'Write it down. Memory is great, but the log is better.',
  'A fresh pair of eyes is sometimes the best test equipment.',
  'Reliability isn\'t luck. It\'s a lot of people doing their jobs well.',
  'Pride in the small jobs leads to trust on the big ones.',
  'Take a breath, check the facts, then act.',
  'Make today\'s handover one you\'d be happy to receive.',
  'The work you do quietly makes everything else possible.',
  'Learning never goes out of service.',
  'Back yourself. You know more than you did yesterday.',
  'Good habits are the best safety system there is.',
  'Plan the work, then work the plan.',
  'Notice what went well today too, not just what went wrong.',
  'Keep going. The skills are adding up even when it doesn\'t feel like it.',
  'Clear communication is half of every fix.',
  'A well-kept log is a gift to the next shift.',
  'Ownership means finishing the job, including the paperwork.',
  'Be curious about the "why", careful about the "how".',
  'Today you get to keep things running safely. That\'s worth being proud of.',
  'Have a good shift. You\'ve got this.'
];

function dailyMessage(d = new Date()) {
  const dayNum = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  return MESSAGES[dayNum % MESSAGES.length];
}
function showDaily() {
  const d = new Date(), dlg = $('#daily');
  $('#daily-date').textContent = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#daily-text').textContent = dailyMessage(d);
  if (!dlg.open) dlg.showModal();
}
function maybeShowDaily() {
  if (settings.daily === false) return;
  const today = dayKey(new Date());
  if (settings.lastDaily === today) return;
  settings.lastDaily = today; saveSettings();
  showDaily();
}
$('#show-daily').addEventListener('click', () => { dlg.close(); showDaily(); });
$('#set-daily').addEventListener('change', ev => { settings.daily = ev.target.checked; saveSettings(); });

/* ---------- clock, sync, start ---------- */
function tick() {
  const d = new Date();
  $('#clock').textContent = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + hhmm(d) + ' local · ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + 'Z';
}
let lastMinute = -1;
setInterval(() => {
  const m = new Date().getMinutes(); if (m === lastMinute) return; lastMinute = m;
  tick(); renderSummary(); syncForm('tech'); maybeShowDaily();
  if (!filters.tech.q) renderLog('tech');
}, 5000);

window.addEventListener('storage', ev => {
  if (ev.key === STORE) { entries = readJSON(STORE, []); renderAll(); }
});

tick();
resetForm('admin'); resetForm('tech');
setTab(settings.tab === 'tech' ? 'tech' : 'admin');
renderAll();
maybeShowDaily();
})();
