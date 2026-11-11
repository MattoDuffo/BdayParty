/* Storage, import parsing and normalization. No DOM. */
(function (global) {
  'use strict';

  const STORE_KEY = 'bdayparty.people.v1';
  const SETTINGS_KEY = 'bdayparty.settings.v1';

  const DEFAULT_SETTINGS = {
    t1: '08:00, 12:00, 17:00, 20:00',
    t1DayBefore: true,
    t2: '09:00, 19:00',
    t3: '09:00',
  };

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }

  function uid() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function loadPeople() {
    const raw = safeGet(STORE_KEY);
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.map(p => normalize(p).person).filter(Boolean) : [];
    } catch (e) { return []; }
  }

  function savePeople(people) {
    return safeSet(STORE_KEY, JSON.stringify(people));
  }

  function loadSettings() {
    try {
      const s = JSON.parse(safeGet(SETTINGS_KEY) || '{}');
      return Object.assign({}, DEFAULT_SETTINGS, s);
    } catch (e) { return Object.assign({}, DEFAULT_SETTINGS); }
  }

  function saveSettings(s) { return safeSet(SETTINGS_KEY, JSON.stringify(s)); }

  // ---------- normalization ----------

  const MONTH_NAMES = {};
  global.Astro.MONTHS.forEach((m, i) => {
    MONTH_NAMES[m.toLowerCase()] = i + 1;
    MONTH_NAMES[m.slice(0, 3).toLowerCase()] = i + 1;
  });
  MONTH_NAMES['sept'] = 9;

  function toInt(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (s === '') return null;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  }

  function parseMonth(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim().toLowerCase().replace(/\.$/, '');
    if (MONTH_NAMES[s]) return MONTH_NAMES[s];
    return toInt(s);
  }

  // Parse a single date string. Returns {day, month, year|null} or null.
  // Supported: 1990-05-21, 1990/05/21, --05-21, 05-21, 21 May 1990, May 21, 1990,
  // May 21, 21/05/1990 (if first > 12), 05/21/1990 (US order otherwise), 05/21.
  function parseDateString(str) {
    if (!str) return null;
    const s = String(str).trim();
    let m;
    if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return { year: +m[1], month: +m[2], day: +m[3] };
    if ((m = s.match(/^-{0,2}(\d{1,2})-(\d{1,2})$/))) return { year: null, month: +m[1], day: +m[2] };
    if ((m = s.match(/^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/))) {
      let a = +m[1], b = +m[2];
      let year = m[3] ? +m[3] : null;
      if (year !== null && year < 100) year += year > (new Date().getFullYear() % 100) ? 1900 : 2000;
      if (a > 12) return { day: a, month: b, year };
      return { month: a, day: b, year };
    }
    // "21 May 1990" / "21 May"
    if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?,?\s*(\d{4})?$/))) {
      const mo = parseMonth(m[2]);
      if (mo) return { day: +m[1], month: mo, year: m[3] ? +m[3] : null };
    }
    // "May 21, 1990" / "May 21"
    if ((m = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?$/))) {
      const mo = parseMonth(m[1]);
      if (mo) return { day: +m[2], month: mo, year: m[3] ? +m[3] : null };
    }
    return null;
  }

  function pick(obj, keys) {
    for (const k of Object.keys(obj)) {
      const norm = k.toLowerCase().replace(/[^a-z]/g, '');
      if (keys.includes(norm)) return obj[k];
    }
    return undefined;
  }

  // Validate & clean a record. Returns {person} or {error}.
  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return { error: 'Not an object' };
    let name = pick(raw, ['name', 'fullname', 'person', 'friend', 'contact']);
    if (name === undefined) {
      const first = pick(raw, ['firstname', 'first', 'givenname']);
      const last = pick(raw, ['lastname', 'last', 'surname', 'familyname']);
      if (first || last) name = [first, last].filter(Boolean).join(' ');
    }
    name = (name || '').toString().trim();
    if (!name) return { error: 'Missing name' };

    let day = toInt(pick(raw, ['day', 'dd', 'birthday_day', 'birthdayday']));
    let month = parseMonth(pick(raw, ['month', 'mm', 'birthdaymonth']));
    let year = toInt(pick(raw, ['year', 'yyyy', 'birthyear', 'yearofbirth']));

    if (!day || !month) {
      const ds = pick(raw, ['birthday', 'date', 'dob', 'birthdate', 'dateofbirth', 'bday']);
      const d = parseDateString(ds);
      if (d) { day = day || d.day; month = month || d.month; if (!year) year = d.year; }
    }
    if (!month || month < 1 || month > 12) return { error: `${name}: invalid or missing month` };
    if (!day || day < 1 || day > 31) return { error: `${name}: invalid or missing day` };
    const maxDay = global.Astro.daysInMonth(2000, month); // 2000 is leap: allows Feb 29
    if (day > maxDay) return { error: `${name}: ${global.Astro.MONTHS[month - 1]} has no day ${day}` };
    if (year !== null && (year < 1900 || year > 2100)) year = null;
    if (year !== null && month === 2 && day === 29 && !global.Astro.isLeap(year)) {
      return { error: `${name}: ${year} was not a leap year (no Feb 29)` };
    }

    let tier = toInt(pick(raw, ['tier', 'priority', 'level']));
    if (!tier || tier < 1 || tier > 4) tier = 3;

    const notes = (pick(raw, ['notes', 'note', 'comment', 'comments', 'description']) || '').toString();
    const id = (raw.id && String(raw.id)) || uid();
    return { person: { id, name, day, month, year, tier, notes } };
  }

  // ---------- CSV ----------

  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const counts = { ',': 0, ';': 0, '\t': 0 };
    for (const ch of firstLine) if (ch in counts) counts[ch]++;
    const delim = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];

    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
        } else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === delim) { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some(f => f.trim() !== '')) rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.some(f => f.trim() !== '')) rows.push(row);
    if (rows.length < 1) return [];

    const header = rows[0].map(h => h.trim());
    return rows.slice(1).map(r => {
      const o = {};
      header.forEach((h, i) => { o[h] = (r[i] || '').trim(); });
      return o;
    });
  }

  // Parse an imported file's text. Returns {people:[], errors:[]}.
  function parseImport(text, filename) {
    let records;
    const trimmed = text.trim();
    const looksJSON = /\.json$/i.test(filename || '') || trimmed.startsWith('[') || trimmed.startsWith('{');
    if (looksJSON) {
      let data;
      try { data = JSON.parse(trimmed); } catch (e) { return { people: [], errors: ['Invalid JSON: ' + e.message] }; }
      if (Array.isArray(data)) records = data;
      else if (data && Array.isArray(data.people)) records = data.people;
      else if (data && Array.isArray(data.birthdays)) records = data.birthdays;
      else return { people: [], errors: ['JSON must be an array of people (or {"people": [...]})'] };
    } else {
      records = parseCSV(text);
    }
    const people = [], errors = [];
    records.forEach((r, i) => {
      const res = normalize(r);
      if (res.person) people.push(res.person);
      else errors.push(`Row ${i + 1}: ${res.error}`);
    });
    return { people, errors };
  }

  function sameEntry(a, b) {
    return a.name.trim().toLowerCase() === b.name.trim().toLowerCase() && a.day === b.day && a.month === b.month;
  }

  global.Data = {
    loadPeople, savePeople, loadSettings, saveSettings, DEFAULT_SETTINGS,
    normalize, parseImport, parseCSV, parseDateString, sameEntry, uid,
  };
})(window);
