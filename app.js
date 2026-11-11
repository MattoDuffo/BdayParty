/* UI: list, editing, import/export, settings. */
(function () {
  'use strict';

  const A = window.Astro, D = window.Data;
  const $ = sel => document.querySelector(sel);
  const BATCH = 40;
  const PAST_DAYS = 10; // the list starts this many days before today

  const state = {
    people: D.loadPeople(),
    settings: D.loadSettings(),
    search: '',
    tier: '',
    // infinite list
    order: [],
    rendered: 0,
    lastHeader: '',
    today: A.startOfDay(new Date()),
  };

  // ---------- helpers ----------

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  let toastTimer;
  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  function persist() {
    if (!D.savePeople(state.people)) toast('⚠️ Could not save — storage is unavailable or full.');
  }

  function confirmDialog(title, bodyHTML, okLabel = 'Confirm', danger = false) {
    const dlg = $('#confirm-dialog');
    $('#confirm-title').textContent = title;
    $('#confirm-body').innerHTML = bodyHTML;
    const ok = $('#confirm-ok');
    ok.textContent = okLabel;
    ok.className = danger ? 'danger-solid' : 'primary';
    dlg.returnValue = '';
    dlg.showModal();
    return new Promise(resolve => {
      dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    });
  }

  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // ---------- occurrence math ----------

  function nextYearFor(p, today) {
    const y = today.getFullYear();
    return A.celebrationDate(y, p.month, p.day) >= today ? y : y + 1;
  }

  function occurrence(p, year, today) {
    const date = A.celebrationDate(year, p.month, p.day);
    return {
      person: p,
      date,
      daysUntil: A.daysBetween(today, date),
      age: p.year ? year - p.year : null,
    };
  }

  function filteredPeople() {
    const q = state.search.trim().toLowerCase();
    return state.people.filter(p =>
      (!q || p.name.toLowerCase().includes(q) || (p.notes || '').toLowerCase().includes(q)) &&
      (!state.tier || String(p.tier) === state.tier));
  }

  // ---------- rendering ----------

  function relLabel(days) {
    if (days === -1) return 'Yesterday';
    if (days < 0) return `${-days} days ago`;
    if (days === 0) return 'Today! 🎉';
    if (days === 1) return 'Tomorrow';
    if (days < 7) return `in ${days} days`;
    if (days < 60) return `in ${Math.round(days / 7) === 1 ? '1 week' : Math.round(days / 7) + ' weeks'}`;
    const months = Math.round(days / 30.44);
    if (days < 365) return `in ${months} months`;
    const yrs = Math.floor(days / 365.25);
    const remMonths = Math.round((days - yrs * 365.25) / 30.44);
    return `in ${yrs} yr${yrs > 1 ? 's' : ''}${remMonths ? ` ${remMonths} mo` : ''}`;
  }

  function cardHTML(occ) {
    const p = occ.person;
    const sign = A.westernSign(p.month, p.day);
    const cz = A.chineseZodiac(p.year, p.month, p.day);
    const bornDow = A.birthWeekday(p.year, p.month, p.day);
    const dow = A.WEEKDAYS[occ.date.getDay()].slice(0, 3);
    const feb29 = p.month === 2 && p.day === 29 && occ.date.getDate() === 28;
    const chips = [
      `<span class="chip" title="Western zodiac">${sign.symbol} ${sign.name}</span>`,
      cz ? `<span class="chip" title="Chinese zodiac (${cz.lunarYear} lunar year)">${cz.emoji} ${cz.element} ${cz.name}</span>` : '',
      bornDow ? `<span class="chip" title="Day of the week they were born">Born on a ${bornDow}</span>` : '',
      feb29 ? `<span class="chip" title="Born Feb 29 — celebrated Feb 28 this year">🐸 Leap day</span>` : '',
    ].join('');
    const past = occ.daysUntil < 0;
    const ageText = occ.age !== null ? `${past ? 'Turned' : 'Turns'} <b>${occ.age}</b>` : '<span class="muted">Age unknown</span>';
    const today = occ.daysUntil === 0 ? ' is-today' : past ? ' is-past' : '';
    return `
      <button class="card tier-${p.tier}${today}" data-id="${esc(p.id)}">
        <div class="date-block">
          <span class="dow">${dow}</span>
          <span class="dnum">${occ.date.getDate()}</span>
          <span class="mon">${A.MONTHS_SHORT[occ.date.getMonth()]}</span>
        </div>
        <div class="card-body">
          <div class="card-top">
            <span class="name">${esc(p.name)}</span>
            <span class="tier-badge" title="Tier ${p.tier}">T${p.tier}</span>
          </div>
          <div class="card-sub">${ageText} · <span class="rel">${relLabel(occ.daysUntil)}</span>${p.notes ? ' · <span title="Has notes">📝</span>' : ''}</div>
          <div class="chips">${chips}</div>
        </div>
      </button>`;
  }

  // Remember where a card sits on screen so we can come back to it after an edit.
  // The same person appears once per year in the list, so we anchor on the
  // card's position in the list (not just the scroll offset, which shifts when
  // earlier copies of the same person change size).
  function captureAnchor(el) {
    const cards = [...document.querySelectorAll('#list .card')];
    if (!el || !cards.includes(el)) {
      el = cards.find(c => c.getBoundingClientRect().bottom > 80) || null;
    }
    state.anchor = el ? { index: cards.indexOf(el), top: el.getBoundingClientRect().top } : null;
  }

  // Rebuild the list and return to exactly the same spot (used after edits).
  function refreshInPlace() {
    const a = state.anchor;
    const y = window.scrollY;
    resetList(Math.max(state.rendered, a ? a.index + 1 : 0));
    const restore = () => {
      const cards = document.querySelectorAll('#list .card');
      if (!a || !cards.length) { window.scrollTo(0, y); return; }
      const c = cards[Math.min(a.index, cards.length - 1)];
      window.scrollBy(0, c.getBoundingClientRect().top - a.top);
    };
    restore();
    requestAnimationFrame(restore); // again after layout settles (iOS)
  }

  function resetList(minItems = 0) {
    state.today = A.startOfDay(new Date());
    const start = new Date(state.today.getFullYear(), state.today.getMonth(), state.today.getDate() - PAST_DAYS);
    state.order = filteredPeople()
      .map(p => ({ p, first: nextYearFor(p, start) }))
      .sort((a, b) => {
        const da = A.celebrationDate(a.first, a.p.month, a.p.day);
        const db = A.celebrationDate(b.first, b.p.month, b.p.day);
        return da - db || a.p.tier - b.p.tier || a.p.name.localeCompare(b.p.name);
      });
    state.rendered = 0;
    state.lastHeader = '';
    state.hadPast = false;
    state.todayMarked = false;
    $('#list').innerHTML = '';
    $('#empty').classList.toggle('hidden', state.people.length > 0);
    if (state.people.length > 0 && state.order.length === 0) {
      $('#list').innerHTML = '<p class="muted center">No matches.</p>';
    }
    renderBanners();
    renderMore();
    while (state.order.length && state.rendered < minItems) renderMore();
  }

  // Each "lap" through the sorted list is one more year, so the list never ends.
  function renderMore() {
    const n = state.order.length;
    if (!n) return;
    const parts = [];
    for (let k = 0; k < BATCH; k++) {
      const i = state.rendered++;
      const lap = Math.floor(i / n);
      const entry = state.order[i % n];
      const occ = occurrence(entry.p, entry.first + lap, state.today);
      if (occ.daysUntil < 0) state.hadPast = true;
      else if (!state.todayMarked) {
        state.todayMarked = true;
        if (state.hadPast) parts.push('<div class="today-divider"><span>Today · upcoming</span></div>');
      }
      const header = `${A.MONTHS[occ.date.getMonth()]} ${occ.date.getFullYear()}`;
      if (header !== state.lastHeader) {
        parts.push(`<h2 class="month-header">${header}</h2>`);
        state.lastHeader = header;
      }
      parts.push(cardHTML(occ));
    }
    $('#list').insertAdjacentHTML('beforeend', parts.join(''));
    // Keep filling if the sentinel is still visible (short lists / tall screens).
    requestAnimationFrame(() => {
      const r = $('#sentinel').getBoundingClientRect();
      if (r.top < window.innerHeight + 600 && state.rendered < 5000) renderMore();
    });
  }

  function renderBanners() {
    const today = state.today;
    const todays = state.people
      .map(p => occurrence(p, today.getFullYear(), today))
      .filter(o => o.daysUntil === 0)
      .sort((a, b) => a.person.tier - b.person.tier);
    const html = todays.filter(o => o.person.tier <= 2).map(o => {
      const p = o.person;
      const age = o.age !== null ? ` turns ${o.age}` : `'s birthday`;
      if (p.tier === 1) {
        return `<button class="banner banner-1" data-id="${esc(p.id)}">
          <span class="banner-emoji">🎉🎂🎈</span>
          <span class="banner-title">TODAY</span>
          <span class="banner-name">${esc(p.name)}${esc(age)}!</span>
          <span class="banner-sub">Don't forget to wish them a happy birthday 💜</span>
        </button>`;
      }
      return `<button class="banner banner-2" data-id="${esc(p.id)}">🎂 Today: <b>${esc(p.name)}</b>${esc(age)}</button>`;
    });
    // Tier 1 in the next 7 days: heads-up
    const soon = state.people
      .filter(p => p.tier === 1)
      .map(p => occurrence(p, nextYearFor(p, today), today))
      .filter(o => o.daysUntil > 0 && o.daysUntil <= 7)
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .map(o => `<button class="banner banner-soon" data-id="${esc(o.person.id)}">⏰ <b>${esc(o.person.name)}</b> — ${relLabel(o.daysUntil).toLowerCase()} (${A.WEEKDAYS[o.date.getDay()]})</button>`);
    $('#today-banners').innerHTML = html.concat(soon).join('');
  }

  // ---------- edit dialog ----------

  const editDlg = $('#edit-dialog');
  const form = $('#edit-form');
  let editing = null; // person being edited, or null for new

  (function fillMonths() {
    form.month.innerHTML = A.MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
  })();

  function openEditor(person, anchorEl) {
    editing = person || null;
    captureAnchor(anchorEl);
    $('#edit-title').textContent = person ? 'Edit birthday' : 'Add birthday';
    $('#btn-delete').classList.toggle('hidden', !person);
    $('#edit-error').textContent = '';
    const p = person || { name: '', day: '', month: state.today.getMonth() + 1, year: '', tier: 3, notes: '' };
    form.name.value = p.name;
    form.day.value = p.day;
    form.month.value = p.month;
    form.year.value = p.year || '';
    form.tier.value = String(p.tier);
    form.notes.value = p.notes || '';
    editDlg.showModal();
    if (!person) form.name.focus();
  }

  function describeDate(p) {
    return `${A.MONTHS[p.month - 1]} ${p.day}${p.year ? ', ' + p.year : ''}`;
  }

  async function onSave(e) {
    e.preventDefault();
    const res = D.normalize({
      id: editing ? editing.id : undefined,
      name: form.name.value,
      day: form.day.value,
      month: form.month.value,
      year: form.year.value,
      tier: form.tier.value,
      notes: form.notes.value,
    });
    if (res.error) { $('#edit-error').textContent = res.error.replace(/^[^:]*: /, ''); return; }
    const updated = res.person;
    if (form.year.value && !updated.year) { $('#edit-error').textContent = 'Year must be between 1900 and 2100.'; return; }

    if (!editing) {
      state.people.push(updated);
      persist();
      editDlg.close();
      refreshInPlace();
      toast(`Added ${updated.name} 🎈`);
      return;
    }

    const changes = [];
    const fields = [
      ['Name', p => p.name],
      ['Day', p => p.day],
      ['Month', p => A.MONTHS[p.month - 1]],
      ['Year', p => p.year || '—'],
      ['Tier', p => p.tier],
    ];
    for (const [label, get] of fields) {
      if (String(get(editing)) !== String(get(updated))) {
        changes.push(`<li><b>${label}:</b> <s>${esc(get(editing))}</s> → ${esc(get(updated))}</li>`);
      }
    }
    if ((editing.notes || '') !== (updated.notes || '')) changes.push('<li><b>Notes</b> changed</li>');
    if (!changes.length) { editDlg.close(); return; }

    const ok = await confirmDialog(
      `Save changes to ${updated.name}?`,
      `<ul class="changes">${changes.join('')}</ul><p class="muted">New birthday: ${esc(describeDate(updated))}</p>`,
      'Save changes');
    if (!ok) return;
    const idx = state.people.findIndex(p => p.id === editing.id);
    if (idx >= 0) state.people[idx] = updated;
    persist();
    editDlg.close();
    refreshInPlace();
    toast('Saved ✔');
  }

  async function onDelete() {
    if (!editing) return;
    const ok = await confirmDialog(`Delete ${editing.name}?`, '<p>This removes the birthday and its notes. It cannot be undone (unless you have a backup).</p>', 'Delete', true);
    if (!ok) return;
    state.people = state.people.filter(p => p.id !== editing.id);
    persist();
    editDlg.close();
    refreshInPlace();
    toast('Deleted');
  }

  // ---------- import / export ----------

  let pendingImport = [];

  function onFileChosen(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { people, errors } = D.parseImport(String(reader.result), file.name);
      if (!people.length) {
        confirmDialog('Nothing to import', `<p>No valid birthdays found in <b>${esc(file.name)}</b>.</p>${errorList(errors)}`, 'OK');
        return;
      }
      pendingImport = people.map(p => ({ p, dupe: state.people.some(x => D.sameEntry(x, p)) }));
      const dupes = pendingImport.filter(x => x.dupe).length;
      $('#import-summary').innerHTML =
        `<p>Found <b>${people.length}</b> birthday${people.length > 1 ? 's' : ''} in <b>${esc(file.name)}</b>` +
        (dupes ? `, <b>${dupes}</b> already in your list` : '') + '.</p>' + errorList(errors);
      $('#import-table').innerHTML = '<tr><th>Name</th><th>Date</th><th>Tier</th><th></th></tr>' +
        pendingImport.map(({ p, dupe }) =>
          `<tr class="${dupe ? 'dupe' : ''}"><td>${esc(p.name)}</td><td>${esc(describeDate(p))}</td><td>${p.tier}</td><td>${dupe ? 'exists' : 'new'}</td></tr>`).join('');
      const settingsDlg = $('#settings-dialog');
      if (settingsDlg.open) settingsDlg.close();
      const dlg = $('#import-dialog');
      dlg.returnValue = '';
      dlg.showModal();
    };
    reader.readAsText(file);
  }

  function errorList(errors) {
    if (!errors.length) return '';
    const shown = errors.slice(0, 8).map(e => `<li>${esc(e)}</li>`).join('');
    const more = errors.length > 8 ? `<li>…and ${errors.length - 8} more</li>` : '';
    return `<details class="errors"><summary>⚠️ ${errors.length} row${errors.length > 1 ? 's' : ''} skipped</summary><ul>${shown}${more}</ul></details>`;
  }

  function onImportClosed() {
    if ($('#import-dialog').returnValue !== 'ok') { pendingImport = []; return; }
    const skip = $('#import-skip-dupes').checked;
    const ids = new Set(state.people.map(p => p.id));
    let added = 0;
    for (const { p, dupe } of pendingImport) {
      if (skip && dupe) continue;
      const person = Object.assign({}, p);
      if (ids.has(person.id)) person.id = D.uid();
      ids.add(person.id);
      state.people.push(person);
      added++;
    }
    pendingImport = [];
    persist();
    resetList();
    toast(`Imported ${added} birthday${added === 1 ? '' : 's'} 🎉`);
  }

  function exportBackup() {
    const stamp = new Date().toISOString().slice(0, 10);
    download(`bdayparty-backup-${stamp}.json`, JSON.stringify(state.people, null, 2), 'application/json');
  }

  function buildCalendar() {
    if (!state.people.some(p => p.tier !== 4)) { toast('No Tier 1–3 birthdays to export.'); return null; }
    return ICS.buildICS(state.people, state.settings);
  }

  function exportICS() {
    const ics = buildCalendar();
    if (!ics) return;
    download('bdayparty-birthdays.ics', ics.text, 'text/calendar');
    toast(`Calendar file with ${ics.count} birthdays created 📅`);
  }

  async function shareICS() {
    const ics = buildCalendar();
    if (!ics) return;
    const file = new File([ics.text], 'bdayparty-birthdays.ics', { type: 'text/calendar' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Birthdays' }); } catch (e) { /* cancelled */ }
    } else {
      toast('Sharing files is not supported here — using download instead.');
      download(file.name, ics.text, 'text/calendar');
    }
  }

  // ---------- tier descriptions ----------

  function fmtTimes(str) {
    const list = ICS.parseTimes(str).map(t => `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}`);
    if (!list.length) return 'no times set';
    return list.length === 1 ? list[0] : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
  }

  function openTiers() {
    const s = state.settings;
    const count = t => state.people.filter(p => p.tier === t).length;
    const t3 = ICS.parseTimes(s.t3).slice(0, 1);
    const tiers = [
      {
        n: 1, title: 'Must remember',
        app: 'A huge banner at the top of the app all day, a heads-up banner during the 7 days before, and the biggest card in the list.',
        cal: `${s.t1DayBefore ? 'An alert the evening before (20:00), then alerts' : 'Alerts'} on the day at ${fmtTimes(s.t1)}.`,
      },
      {
        n: 2, title: 'Important',
        app: 'A banner at the top of the app on the day.',
        cal: `Two reminders on the day, morning and evening: ${fmtTimes(s.t2)}.`,
      },
      {
        n: 3, title: 'Normal',
        app: 'Its card is highlighted on the day.',
        cal: t3.length ? `One reminder on the day at ${String(t3[0].h).padStart(2, '0')}:${String(t3[0].m).padStart(2, '0')}.` : 'One reminder on the day (no time set).',
      },
      {
        n: 4, title: 'In-app only',
        app: 'A smaller card in the list.',
        cal: 'No reminders. Left out of the calendar export.',
      },
    ];
    $('#tiers-list').innerHTML = tiers.map(t => {
      const c = count(t.n);
      return `<div class="tier-info tier-${t.n}">
        <div class="tier-info-head"><span class="tier-badge">T${t.n}</span><b>${t.title}</b><span class="muted tier-count">${c} ${c === 1 ? 'person' : 'people'}</span></div>
        <p><span class="tier-label">In the app:</span> ${t.app}</p>
        <p><span class="tier-label">Calendar:</span> ${t.cal}</p>
      </div>`;
    }).join('');
    $('#tiers-dialog').showModal();
  }

  // ---------- settings ----------

  function openSettings() {
    const f = $('#settings-form');
    f.t1.value = state.settings.t1;
    f.t1DayBefore.checked = !!state.settings.t1DayBefore;
    f.t2.value = state.settings.t2;
    f.t3.value = state.settings.t3;
    $('#settings-dialog').showModal();
  }

  function saveSettingsFromForm() {
    const f = $('#settings-form');
    state.settings = {
      t1: f.t1.value.trim() || D.DEFAULT_SETTINGS.t1,
      t1DayBefore: f.t1DayBefore.checked,
      t2: f.t2.value.trim() || D.DEFAULT_SETTINGS.t2,
      t3: f.t3.value.trim() || D.DEFAULT_SETTINGS.t3,
    };
    D.saveSettings(state.settings);
  }

  async function clearAll() {
    if (!state.people.length) { toast('Nothing to delete.'); return; }
    const ok = await confirmDialog('Delete ALL birthdays?', `<p>This removes all <b>${state.people.length}</b> entries from this device. Export a backup first if you might want them back.</p>`, 'Delete all', true);
    if (!ok) return;
    state.people = [];
    persist();
    resetList();
    toast('All birthdays deleted');
  }

  // ---------- wiring ----------

  function onCardClick(e) {
    const el = e.target.closest('[data-id]');
    if (!el) return;
    const p = state.people.find(x => x.id === el.dataset.id);
    if (p) openEditor(p, el.closest('#list') ? el : null);
  }

  $('#list').addEventListener('click', onCardClick);
  $('#today-banners').addEventListener('click', onCardClick);
  $('#btn-add').addEventListener('click', () => openEditor(null));
  form.addEventListener('submit', onSave);
  $('#btn-cancel').addEventListener('click', () => editDlg.close());
  $('#btn-delete').addEventListener('click', onDelete);

  let searchTimer;
  $('#search').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.search = e.target.value; resetList(); }, 150);
  });
  $('#tier-filter').addEventListener('change', e => { state.tier = e.target.value; resetList(); });

  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-tiers').addEventListener('click', openTiers);
  $('#btn-tiers-help').addEventListener('click', openTiers);
  $('#settings-form').addEventListener('input', saveSettingsFromForm);
  $('#btn-import').addEventListener('click', () => $('#file-input').click());
  $('#file-input').addEventListener('change', onFileChosen);
  $('#import-dialog').addEventListener('close', onImportClosed);
  $('#btn-export').addEventListener('click', exportBackup);
  $('#btn-ics').addEventListener('click', exportICS);
  $('#btn-ics-share').addEventListener('click', shareICS);
  $('#btn-clear').addEventListener('click', clearAll);

  // Close dialogs by tapping the backdrop.
  document.querySelectorAll('dialog').forEach(d => {
    d.addEventListener('click', e => { if (e.target === d) d.close('cancel'); });
  });

  new IntersectionObserver(entries => {
    if (entries.some(en => en.isIntersecting)) renderMore();
  }, { rootMargin: '800px' }).observe($('#sentinel'));

  // Refresh when coming back to the app on a new day.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && A.daysBetween(state.today, new Date()) !== 0) resetList();
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  resetList();
})();
