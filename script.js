import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

// ============================
//  MeetGrid – Firebase app
// ============================

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const EVENTS_COLLECTION = 'meetgrid_events';

// ---- Utility ----
function genId() {
  return Math.random().toString(36).slice(2, 10);
}
function eventDocRef(eventId) {
  return doc(db, EVENTS_COLLECTION, eventId);
}
function setShareUrl(eventId) {
  const shareUrl = eventId ? `${window.location.href.split('#')[0]}#${eventId}` : '';
  document.getElementById('share-url').value = shareUrl;
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.add('hidden'), 2000);
}

function formatDateShort(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return { day: days[dt.getDay()], num: d, mon: months[m - 1] };
}
function parseTimeValue(value) {
  if (typeof value === 'string') {
    if (value.includes(':')) {
      const [hours, minutes] = value.split(':').map(Number);
      return (hours * 60) + minutes;
    }
    value = Number(value);
  }

  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return num <= 24 ? Math.round(num * 60) : Math.round(num);
}
function timeValueToKey(value) {
  const totalMinutes = parseTimeValue(value);
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}
function normalizeSlotKey(slotKey) {
  if (!slotKey || !slotKey.includes('_')) return slotKey;
  const [datePart, timePart] = slotKey.split('_');
  return `${datePart}_${timeValueToKey(timePart)}`;
}
function normalizeAvailabilityMap(availability = {}) {
  return Object.fromEntries(
    Object.entries(availability).map(([name, slots]) => [
      name,
      Array.from(new Set((slots || []).map(normalizeSlotKey)))
    ])
  );
}
function formatHour(value) {
  const totalMinutes = parseTimeValue(value);
  const normalizedMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  const hour24 = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;
  const suffix = hour24 < 12 ? 'AM' : 'PM';
  const displayHour = hour24 % 12 || 12;
  return minutes === 0
    ? `${displayHour} ${suffix}`
    : `${displayHour}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

function getFirebaseSetupHint(error) {
  const message = String(error?.message || '').toLowerCase();

  if (message.includes('api has not been used') || message.includes('firestore') && message.includes('disabled')) {
    return 'Enable Firestore Database for this Firebase project, then wait a minute and retry.';
  }

  if (message.includes('missing or insufficient permissions') || message.includes('permission-denied')) {
    return 'Your Firestore rules are still blocking access. Publish the rules for `meetgrid_events` in the Firebase Console.';
  }

  if (message.includes('not found')) {
    return 'Create the Firestore Database in the Firebase Console first, then retry.';
  }

  return 'Double-check the Firebase web config and make sure Firestore is enabled for this project.';
}

// ---- Calendar ----
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let selectedDates = [];

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const label = document.getElementById('month-label');
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  label.textContent = `${months[calMonth]} ${calYear}`;
  grid.innerHTML = '';

  const days = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  days.forEach(d => {
    const h = document.createElement('div');
    h.className = 'cal-day-header';
    h.textContent = d;
    grid.appendChild(h);
  });

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day empty';
    grid.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const cell = document.createElement('div');
    cell.className = 'cal-day';
    cell.textContent = d;
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const thisDate = new Date(calYear, calMonth, d);

    if (thisDate < today) {
      cell.classList.add('past');
    } else {
      if (selectedDates.includes(dateStr)) cell.classList.add('selected');
      cell.addEventListener('click', () => toggleDate(dateStr, cell));
    }
    grid.appendChild(cell);
  }
}

function toggleDate(dateStr, cell) {
  const idx = selectedDates.indexOf(dateStr);
  if (idx === -1) {
    selectedDates.push(dateStr);
    selectedDates.sort();
    cell.classList.add('selected');
  } else {
    selectedDates.splice(idx, 1);
    cell.classList.remove('selected');
  }
  renderSelectedChips();
}

function renderSelectedChips() {
  const list = document.getElementById('selected-dates-list');
  list.innerHTML = '';
  selectedDates.forEach(ds => {
    const { day, num, mon } = formatDateShort(ds);
    const chip = document.createElement('div');
    chip.className = 'date-chip';
    chip.innerHTML = `${day} ${mon} ${num} <button data-date="${ds}">×</button>`;
    chip.querySelector('button').addEventListener('click', () => {
      selectedDates = selectedDates.filter(d => d !== ds);
      renderSelectedChips();
      renderCalendar();
    });
    list.appendChild(chip);
  });
}

function populateHourSelects() {
  const startSel = document.getElementById('start-hour');
  const endSel = document.getElementById('end-hour');
  for (let minutes = 0; minutes <= 24 * 60; minutes += 30) {
    const value = String(minutes / 60);
    const s = new Option(formatHour(minutes), value);
    const e = new Option(formatHour(minutes), value);
    startSel.appendChild(s);
    endSel.appendChild(e);
  }
  startSel.value = '9';
  endSel.value = '21';
}

// ---- Grid ----
let currentEventId = null;
let currentEventData = null;
let currentMode = 'edit'; // 'edit' | 'group'
let currentParticipant = null;
let isDragging = false;
let dragState = null; // 'adding' | 'removing'
let mySlots = new Set();
let unsubscribeEventListener = null;

function buildGrid() {
  const ev = currentEventData;
  if (!ev) return;

  const grid = document.getElementById('availability-grid');
  grid.innerHTML = '';

  const dates = ev.dates || [];
  const startMinutes = parseTimeValue(ev.start_hour);
  const endMinutes = parseTimeValue(ev.end_hour);
  const numCols = dates.length;
  const numRows = Math.max(0, Math.round((endMinutes - startMinutes) / 30));

  grid.style.gridTemplateColumns = `60px repeat(${numCols}, 52px)`;

  const corner = document.createElement('div');
  corner.className = 'grid-corner';
  grid.appendChild(corner);

  dates.forEach(ds => {
    const { day, num, mon } = formatDateShort(ds);
    const h = document.createElement('div');
    h.className = 'grid-date-header';
    h.innerHTML = `${day}<span>${num}</span>${mon}`;
    grid.appendChild(h);
  });

  for (let row = 0; row < numRows; row++) {
    const slotMinutes = startMinutes + (row * 30);

    const label = document.createElement('div');
    label.className = 'grid-time-label';
    label.textContent = formatHour(slotMinutes);
    grid.appendChild(label);

    dates.forEach(ds => {
      const slotKey = `${ds}_${timeValueToKey(slotMinutes)}`;
      const cell = document.createElement('div');
      cell.className = 'grid-cell';
      cell.dataset.slot = slotKey;
      cell.dataset.mode = currentMode;

      if (currentMode === 'edit') {
        if (mySlots.has(slotKey)) cell.classList.add('free');
        cell.addEventListener('mousedown', (e) => {
          e.preventDefault();
          isDragging = true;
          dragState = mySlots.has(slotKey) ? 'removing' : 'adding';
          toggleCell(cell, slotKey);
        });
        cell.addEventListener('mouseenter', () => {
          if (isDragging) toggleCell(cell, slotKey);
        });
      } else {
        updateGroupCell(cell, slotKey, ev);
        cell.dataset.mode = 'group';
      }

      grid.appendChild(cell);
    });
  }
}

function toggleCell(cell, slotKey) {
  if (dragState === 'adding') {
    mySlots.add(slotKey);
    cell.classList.add('free');
  } else {
    mySlots.delete(slotKey);
    cell.classList.remove('free');
  }
}

function updateGroupCell(cell, slotKey, ev) {
  const participants = ev.availability || {};
  const total = Object.keys(participants).length;
  const freeNames = [];

  Object.entries(participants).forEach(([name, slots]) => {
    const normalizedSlots = new Set((slots || []).map(normalizeSlotKey));
    if (normalizedSlots.has(slotKey)) freeNames.push(name);
  });

  cell.className = 'grid-cell';
  cell.dataset.mode = 'group';
  if (total === 0 || freeNames.length === 0) {
    cell.classList.add('heat-0');
  } else {
    const ratio = freeNames.length / total;
    const heat = Math.ceil(ratio * 5);
    cell.classList.add(`heat-${heat}`);
  }

  if (freeNames.length > 0) {
    const tip = document.createElement('div');
    tip.className = 'cell-tooltip';
    const [ds, h] = slotKey.split('_');
    const { day, num, mon } = formatDateShort(ds);
    tip.innerHTML = `<strong>${day} ${mon} ${num} · ${formatHour(h)}</strong><br>${freeNames.join(', ')}`;
    cell.appendChild(tip);
  }
}

function updateGroupView() {
  const ev = currentEventData;
  if (!ev) return;

  const cells = document.querySelectorAll('.grid-cell[data-mode="group"]');
  cells.forEach(cell => {
    const slotKey = cell.dataset.slot;
    cell.innerHTML = '';
    updateGroupCell(cell, slotKey, ev);
  });
  renderBestTimes();
}

function renderBestTimes() {
  const ev = currentEventData;
  const list = document.getElementById('best-times-list');
  const card = document.getElementById('best-times-card');
  list.innerHTML = '';

  if (!ev) {
    card.classList.add('hidden');
    return;
  }

  const participants = ev.availability || {};
  const total = Object.keys(participants).length;
  if (total === 0) {
    card.classList.add('hidden');
    return;
  }

  const slotCounts = {};
  Object.values(participants).forEach(slots => {
    (slots || []).map(normalizeSlotKey).forEach(s => {
      slotCounts[s] = (slotCounts[s] || 0) + 1;
    });
  });

  const sorted = Object.entries(slotCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (sorted.length === 0) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');
  sorted.forEach(([slot, count]) => {
    const [ds, h] = slot.split('_');
    const { day, num, mon } = formatDateShort(ds);
    const li = document.createElement('li');
    li.innerHTML = `<span>${day} ${mon} ${num}<br><small>${formatHour(h)}</small></span><span class="best-count">${count}/${total}</span>`;
    list.appendChild(li);
  });
}

function updateParticipantControls() {
  const actions = document.getElementById('participant-actions');
  const typedName = document.getElementById('participant-name').value.trim();
  const hasKnownName = Boolean(currentParticipant || typedName);

  actions.classList.toggle('hidden', !hasKnownName);
  document.getElementById('save-availability-btn').disabled = currentMode !== 'edit' || !hasKnownName;
  document.getElementById('rename-btn').disabled = !currentParticipant || !typedName;
  document.getElementById('delete-btn').disabled = !hasKnownName;
}

function startEditingParticipant(name) {
  const availability = currentEventData?.availability || {};
  currentParticipant = name;
  const existing = availability[name] || [];
  mySlots = new Set(existing.map(normalizeSlotKey));
  document.getElementById('participant-name').value = name;
  switchMode('edit');
  renderParticipants();
  updateParticipantControls();
  return existing.length > 0;
}

async function saveMyAvailability() {
  const name = document.getElementById('participant-name').value.trim();
  if (!name) {
    showToast('Please enter your name first.');
    return;
  }
  if (!currentEventId) return;

  const previousName = currentParticipant;
  const normalizedSlots = Array.from(mySlots).map(normalizeSlotKey);

  try {
    await runTransaction(db, async (transaction) => {
      const ref = eventDocRef(currentEventId);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error('This event no longer exists.');

      const eventData = snapshot.data();
      const availability = normalizeAvailabilityMap(eventData.availability || {});

      if (previousName && previousName !== name && availability[previousName] && !availability[name]) {
        delete availability[previousName];
      }

      availability[name] = normalizedSlots;
      transaction.update(ref, {
        availability,
        updatedAt: serverTimestamp()
      });
    });

    currentParticipant = name;
    showToast('Availability saved!');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Could not save availability.');
  }
}

async function renameParticipant() {
  if (!currentParticipant || !currentEventId) {
    showToast('Select your existing availability first.');
    return;
  }

  const newName = document.getElementById('participant-name').value.trim();
  if (!newName) {
    showToast('Enter the new name first.');
    return;
  }
  if (newName === currentParticipant) {
    showToast('Name is already up to date.');
    return;
  }

  try {
    await runTransaction(db, async (transaction) => {
      const ref = eventDocRef(currentEventId);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error('This event no longer exists.');

      const eventData = snapshot.data();
      const availability = normalizeAvailabilityMap(eventData.availability || {});

      if (!availability[currentParticipant]) {
        throw new Error('No saved availability was found for that participant.');
      }
      if (availability[newName]) {
        throw new Error('That name is already being used for this event.');
      }

      availability[newName] = availability[currentParticipant];
      delete availability[currentParticipant];

      transaction.update(ref, {
        availability,
        updatedAt: serverTimestamp()
      });
    });

    currentParticipant = newName;
    document.getElementById('participant-name').value = newName;
    showToast('Name updated!');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Could not rename this participant.');
  }
}

async function deleteParticipantAvailability() {
  const typedName = document.getElementById('participant-name').value.trim();
  const targetName = currentParticipant || typedName;
  if (!targetName || !currentEventId) {
    showToast('Select or enter the name you want to remove.');
    return;
  }
  if (!confirm(`Delete availability for ${targetName}?`)) return;

  try {
    await runTransaction(db, async (transaction) => {
      const ref = eventDocRef(currentEventId);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error('This event no longer exists.');

      const eventData = snapshot.data();
      const availability = normalizeAvailabilityMap(eventData.availability || {});
      if (!availability[targetName]) {
        throw new Error('No saved availability was found for that name.');
      }

      delete availability[targetName];
      transaction.update(ref, {
        availability,
        updatedAt: serverTimestamp()
      });
    });

    if (currentParticipant === targetName) {
      currentParticipant = null;
      mySlots = new Set();
      document.getElementById('participant-name').value = '';
    }

    showToast('Availability deleted.');
    switchMode('group');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Could not delete this participant.');
  }
}

function renderParticipants() {
  const ev = currentEventData;
  if (!ev) return;

  const participants = ev.availability || {};
  const list = document.getElementById('participants-list');
  list.innerHTML = '';

  Object.keys(participants).sort().forEach(name => {
    const li = document.createElement('li');
    if (name === currentParticipant) li.classList.add('active-participant');
    li.innerHTML = `<span class="participant-dot"></span>${name}`;
    li.addEventListener('click', () => {
      startEditingParticipant(name);
      showToast(`Editing ${name}'s availability.`);
    });
    list.appendChild(li);
  });

  updateParticipantControls();
}

function switchMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  document.getElementById('group-legend').style.display = mode === 'group' ? 'flex' : 'none';
  buildGrid();
  updateParticipantControls();
  if (mode === 'group') updateGroupView();
}

// ---- Event creation / loading ----
async function createEvent() {
  const title = document.getElementById('event-title').value.trim();
  const startH = parseFloat(document.getElementById('start-hour').value);
  const endH = parseFloat(document.getElementById('end-hour').value);

  if (!title) { showToast('Please enter an event name.'); return; }
  if (selectedDates.length === 0) { showToast('Please select at least one date.'); return; }
  if (endH <= startH) { showToast('End time must be after start time.'); return; }

  const id = genId();
  const payload = {
    title,
    dates: [...selectedDates],
    start_hour: startH,
    end_hour: endH,
    availability: {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(eventDocRef(id), payload);
    window.location.hash = id;
  } catch (error) {
    console.error(error);
    showToast(`${error.message || 'Could not create the event in Firebase.'}\n\n${getFirebaseSetupHint(error)}`);
  }
}

function loadEvent(id) {
  if (unsubscribeEventListener) {
    unsubscribeEventListener();
    unsubscribeEventListener = null;
  }

  currentEventId = id;
  currentEventData = null;
  currentMode = 'group';
  currentParticipant = null;
  mySlots = new Set();

  document.getElementById('participant-name').value = '';
  updateParticipantControls();
  document.getElementById('home-view').classList.remove('active');
  document.getElementById('event-view').classList.add('active');
  document.getElementById('event-name-display').textContent = 'Loading…';
  setShareUrl(id);

  unsubscribeEventListener = onSnapshot(eventDocRef(id), (snapshot) => {
    if (!snapshot.exists()) {
      showToast('Event not found.');
      window.location.hash = '';
      return;
    }

    currentEventData = {
      ...snapshot.data(),
      availability: normalizeAvailabilityMap(snapshot.data().availability || {})
    };

    document.getElementById('event-name-display').textContent = currentEventData.title;
    setShareUrl(id);

    if (currentParticipant && !currentEventData.availability[currentParticipant]) {
      currentParticipant = null;
      mySlots = new Set();
      document.getElementById('participant-name').value = '';
      currentMode = 'group';
    } else if (currentParticipant) {
      mySlots = new Set((currentEventData.availability[currentParticipant] || []).map(normalizeSlotKey));
    }

    renderParticipants();
    if (currentMode === 'group') {
      switchMode('group');
    } else {
      buildGrid();
      renderBestTimes();
    }
  }, (error) => {
    console.error(error);
    showToast(`${error.message || 'Could not load this event from Firebase.'}\n\n${getFirebaseSetupHint(error)}`);
  });
}

async function copyShareLink() {
  const url = document.getElementById('share-url').value;
  if (!url) return;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const shareInput = document.getElementById('share-url');
      shareInput.focus();
      shareInput.select();
      document.execCommand('copy');
    }

    showToast('Link copied! 🔗');
  } catch (error) {
    console.error(error);
    showToast('Could not copy the link automatically. Please copy it manually.');
  }
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  populateHourSelects();
  renderCalendar();
  updateParticipantControls();

  document.getElementById('participant-name').addEventListener('input', updateParticipantControls);

  document.getElementById('prev-month').addEventListener('click', () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  });

  document.getElementById('next-month').addEventListener('click', () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    dragState = null;
  });

  document.getElementById('create-btn').addEventListener('click', createEvent);

  document.getElementById('copy-btn').addEventListener('click', copyShareLink);

  document.getElementById('back-home').addEventListener('click', (e) => {
    e.preventDefault();
    window.location.hash = '';
  });

  document.getElementById('start-filling-btn').addEventListener('click', () => {
    const name = document.getElementById('participant-name').value.trim();
    if (!name) {
      showToast('Enter your name first!');
      return;
    }

    const hadExistingAvailability = startEditingParticipant(name);
    showToast(
      hadExistingAvailability
        ? `Editing ${name}'s saved availability.`
        : `Welcome, ${name}! Click or drag to mark your free times.`
    );
  });

  document.getElementById('save-availability-btn').addEventListener('click', saveMyAvailability);
  document.getElementById('rename-btn').addEventListener('click', renameParticipant);
  document.getElementById('delete-btn').addEventListener('click', deleteParticipantAvailability);

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.dataset.mode === 'edit') {
        switchMode('edit');
      } else {
        if (currentParticipant) await saveMyAvailability();
        switchMode('group');
      }
    });
  });

  document.getElementById('availability-grid').addEventListener('mouseup', () => {
    if (currentMode === 'edit' && currentParticipant) {
      clearTimeout(window._saveTimer);
      window._saveTimer = setTimeout(() => {
        saveMyAvailability();
      }, 800);
    }
  });

  function handleHash() {
    const id = window.location.hash.slice(1).trim();
    if (id) {
      loadEvent(id);
    } else {
      if (unsubscribeEventListener) {
        unsubscribeEventListener();
        unsubscribeEventListener = null;
      }
      currentEventId = null;
      currentEventData = null;
      currentParticipant = null;
      mySlots = new Set();
      document.getElementById('event-view').classList.remove('active');
      document.getElementById('home-view').classList.add('active');
      document.getElementById('participant-name').value = '';
      document.getElementById('best-times-card').classList.add('hidden');
      updateParticipantControls();
      setShareUrl('');
    }
  }

  window.addEventListener('hashchange', handleHash);
  handleHash();
});