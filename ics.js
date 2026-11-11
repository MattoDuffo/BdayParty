/* iCalendar (.ics) export with tier-based alerts. No DOM. */
(function (global) {
  'use strict';

  // iPhone Calendar keeps at most 2 alerts per event, so any extra alert times
  // become small separate "reminder" events with their own alert.
  const MAX_ALARMS_PER_EVENT = 2;

  function parseTimes(str) {
    return String(str || '')
      .split(/[,\s]+/)
      .map(t => t.trim())
      .filter(Boolean)
      .map(t => {
        const m = t.match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm)?$/i);
        if (!m) return null;
        let h = +m[1];
        const min = m[2] ? +m[2] : 0;
        if (m[3]) {
          const pm = m[3].toLowerCase() === 'pm';
          if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12;
        }
        if (h > 23 || min > 59) return null;
        return { h, m: min };
      })
      .filter(Boolean)
      .sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m))
      .filter((t, i, arr) => i === 0 || t.h * 60 + t.m !== arr[i - 1].h * 60 + arr[i - 1].m);
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; }

  function escapeText(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }

  // Fold lines to 75 octets as required by RFC 5545.
  function fold(line) {
    const bytes = new TextEncoder().encode(line);
    if (bytes.length <= 75) return line;
    const out = [];
    let cur = '', curLen = 0, limit = 75;
    for (const ch of line) {
      const len = new TextEncoder().encode(ch).length;
      if (curLen + len > limit) {
        out.push(cur);
        cur = ''; curLen = 0; limit = 74; // continuation lines start with a space
      }
      cur += ch; curLen += len;
    }
    out.push(cur);
    return out.join('\r\n ');
  }

  function triggerFromMidnight(minutes) {
    const sign = minutes < 0 ? '-' : '';
    const abs = Math.abs(minutes);
    const h = Math.floor(abs / 60), m = abs % 60;
    return `${sign}PT${h}H${m ? m + 'M' : ''}`;
  }

  function alarm(trigger, text) {
    return ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(text)}`, `TRIGGER:${trigger}`, 'END:VALARM'];
  }

  // Start date + RRULE for a yearly birthday. Feb 29 birthdays repeat on the
  // last day of February (Feb 28 in common years, Feb 29 in leap years).
  function recurrence(person, now) {
    const year = now.getFullYear() - 1;
    if (person.month === 2 && person.day === 29) {
      const last = global.Astro.isLeap(year) ? 29 : 28;
      return { start: new Date(year, 1, last), rrule: 'RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1' };
    }
    return { start: new Date(year, person.month - 1, person.day), rrule: 'RRULE:FREQ=YEARLY' };
  }

  function alertTimesFor(person, settings) {
    // Returns minutes relative to midnight of the birthday.
    if (person.tier === 1) {
      const list = parseTimes(settings.t1).map(t => t.h * 60 + t.m);
      if (settings.t1DayBefore) list.unshift(-4 * 60); // 20:00 the evening before
      return list;
    }
    if (person.tier === 2) return parseTimes(settings.t2).map(t => t.h * 60 + t.m);
    if (person.tier === 3) return parseTimes(settings.t3).slice(0, 1).map(t => t.h * 60 + t.m);
    return [];
  }

  function buildICS(people, settings, now) {
    now = now || new Date();
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//BdayParty//Birthday Tracker//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Birthdays (BdayParty)',
    ];
    let count = 0;

    for (const p of people) {
      if (p.tier === 4) continue;
      const { start, rrule } = recurrence(p, now);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
      const loud = p.tier === 1;
      const summary = loud ? `🎉🎂 ${p.name.toUpperCase()}'S BIRTHDAY 🎂🎉` : `🎂 ${p.name}'s birthday`;
      const descParts = [];
      if (p.year) descParts.push(`Born ${global.Astro.MONTHS[p.month - 1]} ${p.day}, ${p.year}`);
      descParts.push(`Tier ${p.tier}`);
      if (p.notes) descParts.push('', p.notes);
      const alertText = loud ? `🎉 TODAY: ${p.name}'s birthday! Don't forget!` : `🎂 ${p.name}'s birthday today`;

      const times = alertTimesFor(p, settings);
      const onMain = times.slice(0, MAX_ALARMS_PER_EVENT);
      const extra = times.slice(MAX_ALARMS_PER_EVENT);

      lines.push(
        'BEGIN:VEVENT',
        `UID:${p.id}-main@bdayparty`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ymd(start)}`,
        `DTEND;VALUE=DATE:${ymd(end)}`,
        rrule,
        `SUMMARY:${escapeText(summary)}`,
        `DESCRIPTION:${escapeText(descParts.join('\n'))}`,
        'TRANSP:TRANSPARENT',
        `PRIORITY:${loud ? 1 : 5}`,
        'CATEGORIES:Birthday',
      );
      for (const min of onMain) {
        const text = min < 0 ? `Tomorrow: ${p.name}'s birthday` : alertText;
        lines.push(...alarm(triggerFromMidnight(min), text));
      }
      lines.push('END:VEVENT');
      count++;

      // Extra reminders as short timed events (floating local time).
      extra.forEach((min, i) => {
        const t = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, min);
        const tEnd = new Date(t.getTime() + 15 * 60000);
        const fmt = d => `${ymd(d)}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
        lines.push(
          'BEGIN:VEVENT',
          `UID:${p.id}-r${i}@bdayparty`,
          `DTSTAMP:${stamp}`,
          `DTSTART:${fmt(t)}`,
          `DTEND:${fmt(tEnd)}`,
          rrule,
          `SUMMARY:${escapeText(`🔔 Reminder: ${p.name}'s birthday`)}`,
          'TRANSP:TRANSPARENT',
          ...alarm('PT0M', alertText),
          'END:VEVENT',
        );
      });
    }
    lines.push('END:VCALENDAR');
    return { text: lines.map(fold).join('\r\n') + '\r\n', count };
  }

  global.ICS = { buildICS, parseTimes };
})(window);
