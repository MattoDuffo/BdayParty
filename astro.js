/* Astrology & calendar helpers. Pure functions, no DOM. */
(function (global) {
  'use strict';

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const MONTHS_SHORT = MONTHS.map(m => m.slice(0, 3));
  const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  // [name, symbol, lastMonth, lastDay] — a sign runs until (and including) lastMonth/lastDay.
  const ZODIAC = [
    ['Capricorn', '♑', 1, 19],
    ['Aquarius', '♒', 2, 18],
    ['Pisces', '♓', 3, 20],
    ['Aries', '♈', 4, 19],
    ['Taurus', '♉', 5, 20],
    ['Gemini', '♊', 6, 20],
    ['Cancer', '♋', 7, 22],
    ['Leo', '♌', 8, 22],
    ['Virgo', '♍', 9, 22],
    ['Libra', '♎', 10, 22],
    ['Scorpio', '♏', 11, 21],
    ['Sagittarius', '♐', 12, 21],
    ['Capricorn', '♑', 12, 31],
  ];

  function westernSign(month, day) {
    for (const [name, symbol, m, d] of ZODIAC) {
      if (month < m || (month === m && day <= d)) return { name, symbol };
    }
    return { name: 'Capricorn', symbol: '♑' };
  }

  const ANIMALS = [
    ['Rat', '🐀'], ['Ox', '🐂'], ['Tiger', '🐅'], ['Rabbit', '🐇'], ['Dragon', '🐉'], ['Snake', '🐍'],
    ['Horse', '🐎'], ['Goat', '🐐'], ['Monkey', '🐒'], ['Rooster', '🐓'], ['Dog', '🐕'], ['Pig', '🐖'],
  ];
  const ELEMENTS = ['Metal', 'Metal', 'Water', 'Water', 'Wood', 'Wood', 'Fire', 'Fire', 'Earth', 'Earth'];

  // Gregorian date (MMDD) of Chinese (Lunar) New Year for 1900..2099.
  const LNY_START = 1900;
  const LNY = ["0131","0219","0208","0129","0216","0204","0125","0213","0202","0122","0210","0130","0218","0206","0126","0214","0203","0123","0211","0201","0220","0208","0128","0216","0205","0124","0213","0202","0123","0210","0130","0217","0206","0126","0214","0204","0124","0211","0131","0219","0208","0127","0215","0205","0125","0213","0202","0122","0210","0129","0217","0206","0127","0214","0203","0124","0212","0131","0218","0208","0128","0215","0205","0125","0213","0202","0121","0209","0130","0217","0206","0127","0215","0203","0123","0211","0131","0218","0207","0128","0216","0205","0125","0213","0202","0220","0209","0129","0217","0206","0127","0215","0204","0123","0210","0131","0219","0207","0128","0216","0205","0124","0212","0201","0122","0209","0129","0218","0207","0126","0214","0203","0123","0210","0131","0219","0208","0128","0216","0205","0125","0212","0201","0122","0210","0129","0217","0206","0126","0213","0203","0123","0211","0131","0219","0208","0128","0215","0204","0124","0212","0201","0122","0210","0130","0217","0206","0126","0214","0202","0123","0211","0201","0219","0208","0128","0215","0204","0124","0212","0202","0121","0209","0129","0217","0205","0126","0214","0203","0123","0211","0131","0219","0207","0127","0215","0205","0124","0212","0202","0122","0209","0129","0217","0206","0126","0214","0203","0124","0210","0130","0218","0207","0127","0215","0205","0125","0212","0201","0121"];

  // Chinese zodiac animal, using the real Lunar New Year date: someone born in
  // January 1990 (before Jan 27) is a Snake (1989), not a Horse.
  function chineseZodiac(year, month, day) {
    if (!year) return null;
    let y = year;
    const idx = year - LNY_START;
    if (idx >= 0 && idx < LNY.length) {
      const mmdd = month * 100 + day;
      if (mmdd < parseInt(LNY[idx], 10)) y = year - 1;
    } else if (month < 2 || (month === 2 && day < 4)) {
      y = year - 1; // fallback approximation outside the table
    }
    const a = ((y - 4) % 12 + 12) % 12;
    const e = ((y % 10) + 10) % 10;
    return { name: ANIMALS[a][0], emoji: ANIMALS[a][1], element: ELEMENTS[e], lunarYear: y };
  }

  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

  // Weekday of the actual birth date.
  function birthWeekday(year, month, day) {
    if (!year) return null;
    return WEEKDAYS[new Date(year, month - 1, day).getDay()];
  }

  // The date the birthday is celebrated in a given year (Feb 29 -> Feb 28 in non-leap years).
  function celebrationDate(year, month, day) {
    if (month === 2 && day === 29 && !isLeap(year)) return new Date(year, 1, 28);
    return new Date(year, month - 1, day);
  }

  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / 86400000); }

  global.Astro = {
    MONTHS, MONTHS_SHORT, WEEKDAYS,
    westernSign, chineseZodiac, birthWeekday, celebrationDate,
    isLeap, daysInMonth, startOfDay, daysBetween,
  };
})(window);
