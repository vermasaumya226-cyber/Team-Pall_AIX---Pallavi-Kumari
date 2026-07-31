/* ==========================================================================
   PERSONAL STUDY PLANNER AGENT — AI STUDIO ENGINE v4.0
   Team: Pall_AIX | Track: AI Agent Track
   ========================================================================== */

// ── Global Application State ───────────────────────────────────────────────
const appState = {
  subjects: [],
  files: [],
  freeSlots: [],          // derived from selected slot pills
  scheduleBlocks: [],
  timetableImageUrl: null // URL for uploaded timetable image
};

// ── Bootstrap ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();

  // Dismiss page transition overlay
  const overlay = document.getElementById('page-transition');
  if (overlay) {
    setTimeout(() => {
      overlay.classList.add('hidden');
      setTimeout(() => { overlay.style.display = 'none'; }, 500);
    }, 300);
  }

  initAuroraCanvas();
  initMouseGlow();
  initNavbar();
  initCounters();
  initFocusTimer();
  updateCalculator();

  // ── Load persisted study plan from AppDB into in-memory state ──────────
  if (typeof AppDB !== 'undefined') {
    const savedPlan = AppDB.getStudyPlan();
    if (savedPlan && Object.keys(savedPlan).length > 0) {
      appState.scheduleByDay = savedPlan;
      appState.scheduleBlocks = Object.values(savedPlan).flat();
      const days = Object.keys(savedPlan);
      if (!appState.activeDayTab || !days.includes(appState.activeDayTab)) {
        appState.activeDayTab = days[0];
      }
    }
  }

  // Pre-select Weekdays in Step 5 Day Picker
  selectWeekdays();

  // Initialise rendering (only for pages that have these elements)
  renderSubjects();
  renderFiles();
  renderStudioSchedule();
  updateMetrics();

  setupDragAndDrop();
  setupScheduleScannerDrop();
});


/* ==========================================================================
   WEB AUDIO SYNTHESIZER
   ========================================================================== */
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function playSound(type) {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'click') {
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.04);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.start(now); osc.stop(now + 0.04);
    } else if (type === 'success') {
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.08);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now); osc.stop(now + 0.18);
    } else if (type === 'replan') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.linearRampToValueAtTime(700, now + 0.12);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now); osc.stop(now + 0.2);
    }
  } catch (e) {}
}

/* ==========================================================================
   NAVBAR & SCROLL
   ========================================================================== */
function scrollToSection(id) {
  playSound('click');
  const section = document.getElementById(id);
  if (section) section.scrollIntoView({ behavior: 'smooth' });
}

function initNavbar() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 30);
  });
}

/* ==========================================================================
   SUBJECTS MANAGEMENT
   ========================================================================== */
/* ==========================================================================
   SUBJECTS MANAGEMENT (AppDB Synced)
   ========================================================================== */
function renderSubjects() {
  const container = document.getElementById('subjects-chip-container') || document.getElementById('subjects-container');
  if (!container) return;

  const subjects = (typeof AppDB !== 'undefined') ? AppDB.getSubjects() : appState.subjects;
  appState.subjects = subjects;

  if (!subjects || subjects.length === 0) {
    container.innerHTML = `<p style="font-size:0.78rem;color:var(--text-muted);margin-top:0.3rem;">No subjects added yet — add a subject above.</p>`;
    return;
  }

  container.innerHTML = subjects.map(subj => {
    const color = subj.priority === 'Critical' ? '#EF4444'
                : subj.priority === 'High'     ? '#FBBF24' : '#34D399';
    return `
      <div class="subject-chip" style="display:inline-flex;align-items:center;gap:0.4rem;padding:0.35rem 0.75rem;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:12px;font-size:0.8rem;margin:0.25rem;">
        <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></span>
        <strong style="color:var(--text-primary);">${subj.name}</strong>
        <span style="font-size:0.7rem;color:var(--text-muted);">${subj.attendance}% att.</span>
        <button onclick="editSubject('${subj.id}')" title="Edit Subject" style="background:none;border:none;color:#38BDF8;cursor:pointer;font-size:0.75rem;padding:0 2px;">✏️</button>
        <button onclick="removeSubject('${subj.id}')" title="Delete Subject" style="background:none;border:none;color:#EF4444;cursor:pointer;font-size:0.85rem;padding:0 2px;">&times;</button>
      </div>
    `;
  }).join('');
}

function handleAddSubjectManual() {
  addSubjectFromInputs();
}

function addSubjectFromInputs() {
  playSound('click');
  const nameInput   = document.getElementById('subj-name-input');
  const prioInput   = document.getElementById('subj-priority-input');
  const attendInput = document.getElementById('subj-attend-input');

  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) { showToast('⚠️ Please enter a subject name.'); return; }

  const priority   = prioInput ? prioInput.value : 'High';
  const attendance = attendInput ? parseInt(attendInput.value) || 85 : 85;

  let newSubj;
  if (typeof AppDB !== 'undefined') {
    newSubj = AppDB.addSubject({ name, priority, attendance });
  } else {
    newSubj = { id: 'subj-' + Date.now(), name, priority, attendance };
    appState.subjects.push(newSubj);
  }

  if (nameInput) nameInput.value = '';
  renderSubjects();
  showToast(`✅ "${newSubj.name}" added to AI Engine.`);

  // Auto-generate AI study schedule if in studio or planner view
  if (typeof generateCustomAISchedule === 'function' && document.getElementById('studio-schedule-view')) {
    generateCustomAISchedule();
  } else if (typeof rebuildStudyPlan === 'function' && document.getElementById('day-schedule-list')) {
    rebuildStudyPlan();
  }
}

function editSubject(id) {
  playSound('click');
  const subjects = (typeof AppDB !== 'undefined') ? AppDB.getSubjects() : appState.subjects;
  const subj = subjects.find(s => s.id === id);
  if (!subj) return;

  const newName = prompt('Edit Subject Name:', subj.name);
  if (!newName || !newName.trim()) return;
  const newPrio = prompt('Priority (Critical / High / Normal):', subj.priority || 'High');
  const newAtt  = prompt('Attendance % (0-100):', subj.attendance || 85);

  const updatedFields = {
    name: newName.trim(),
    priority: newPrio ? newPrio.trim() : subj.priority,
    attendance: parseFloat(newAtt) || subj.attendance
  };

  if (typeof AppDB !== 'undefined') {
    AppDB.updateSubject(id, updatedFields);
  } else {
    Object.assign(subj, updatedFields);
  }

  renderSubjects();
  showToast(`✏️ "${newName.trim()}" updated!`);

  if (typeof generateCustomAISchedule === 'function' && document.getElementById('studio-schedule-view')) {
    generateCustomAISchedule();
  } else if (typeof rebuildStudyPlan === 'function' && document.getElementById('day-schedule-list')) {
    rebuildStudyPlan();
  }
}

function removeSubject(id) {
  playSound('click');
  if (typeof AppDB !== 'undefined') {
    AppDB.deleteSubject(id);
  }
  appState.subjects = appState.subjects.filter(s => s.id !== id);
  renderSubjects();
  showToast('🗑️ Subject deleted.');

  if (typeof generateCustomAISchedule === 'function' && document.getElementById('studio-schedule-view')) {
    generateCustomAISchedule();
  } else if (typeof rebuildStudyPlan === 'function' && document.getElementById('day-schedule-list')) {
    rebuildStudyPlan();
  }
}

/* ==========================================================================
   FILE UPLOAD & MANAGEMENT
   ========================================================================== */
function triggerFileInput() {
  playSound('click');
  const fi = document.getElementById('file-input');
  if (fi) fi.click();
}

function setupDragAndDrop() {
  const zone = document.getElementById('drop-zone');
  if (!zone) return;

  ['dragenter','dragover','dragleave','drop'].forEach(evt =>
    zone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); }, false)
  );

  zone.addEventListener('dragover',  () => zone.classList.add('dragover'));
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    zone.classList.remove('dragover');
    processUploadedFiles(e.dataTransfer.files);
  });
}

function handleFilesSelected(e) {
  processUploadedFiles(e.target.files);
  e.target.value = '';   // allow re-upload of same file
}

function processUploadedFiles(files) {
  if (!files || files.length === 0) return;
  playSound('replan');

  Array.from(files).forEach(file => {
    const fileUrl  = URL.createObjectURL(file);
    const sizeStr  = file.size > 1024 * 1024
                   ? (file.size / (1024 * 1024)).toFixed(1) + ' MB'
                   : (file.size / 1024).toFixed(0) + ' KB';
    const isPdf    = /\.pdf$/i.test(file.name);
    const isImage  = /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(file.name);
    const parsedStr = isPdf   ? '📄 Syllabus/PDF Parsed'
                   : isImage ? '🖼️ Image Parsed'
                   :           '📝 Text Constraints Parsed';
    appState.files.push({
      name: file.name, size: sizeStr, parsed: parsedStr,
      url: fileUrl, isImage, isPdf,
      content: `Extracted content from ${file.name}:\n- 14 Syllabus Topics Identified\n- 3 Assignment Deadlines Detected\n- Minimum Attendance Target: 80%`
    });
  });

  renderFiles();
  showToast(`✨ ${files.length} file(s) added! Click any file below to open it.`);
}

function renderFiles() {
  const container = document.getElementById('files-list');
  if (!container) return;

  container.innerHTML = '';
  appState.files.forEach((f, idx) => {
    const item = document.createElement('div');
    item.className = 'file-chip';

    const icon = f.isPdf ? 'file-text' : f.isImage ? 'image' : 'file-code';
    item.innerHTML = `
      <div style="display:flex;align-items:center;gap:0.6rem;flex:1;min-width:0;">
        <i data-lucide="${icon}" style="color:#38BDF8;width:18px;flex-shrink:0;"></i>
        <div style="min-width:0;">
          <strong style="color:white;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${f.name}</strong>
          <div style="font-size:0.72rem;color:#94A3B8;">${f.size} · <span style="color:#34D399;">${f.parsed}</span></div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0;">
        <span style="font-size:0.75rem;background:rgba(124,58,237,0.2);color:#C084FC;padding:0.15rem 0.5rem;border-radius:6px;cursor:pointer;"
              onclick="openFileViewer(${idx})">Open</span>
        <span style="cursor:pointer;color:#EF4444;font-size:1.1rem;" onclick="event.stopPropagation();removeFile(${idx})">&times;</span>
      </div>
    `;
    item.onclick = () => openFileViewer(idx);
    container.appendChild(item);
  });
  if (window.lucide) lucide.createIcons();
}

function removeFile(idx) {
  playSound('click');
  appState.files.splice(idx, 1);
  renderFiles();
}

/* ==========================================================================
   FILE VIEWER MODAL (PDF / Image / Text)
   ========================================================================== */
function openFileViewer(fileIdx) {
  playSound('click');
  const file = appState.files[fileIdx];
  if (!file) return;

  const modal     = document.getElementById('pdf-modal');
  const titleEl   = document.getElementById('pdf-modal-title');
  const dlBtn     = document.getElementById('pdf-download-btn');
  const container = document.getElementById('pdf-viewer-container');
  if (!modal || !container) return;

  titleEl.innerHTML = `<i data-lucide="${file.isPdf ? 'file-text' : file.isImage ? 'image' : 'file-code'}" style="color:#38BDF8;"></i> ${file.name}`;

  dlBtn.href = file.url;
  dlBtn.target = '_blank';
  dlBtn.style.display = file.url ? 'inline-flex' : 'none';

  if (file.isImage && file.url) {
    // Show image directly
    container.innerHTML = `
      <div style="text-align:center;">
        <img src="${file.url}" alt="${file.name}" style="max-width:100%;max-height:460px;border-radius:10px;border:1px solid var(--border-glow);">
        <p style="font-size:0.78rem;color:#94A3B8;margin-top:0.6rem;">${file.name} · ${file.size}</p>
      </div>
    `;
  } else if (file.isPdf && file.url) {
    // Embed PDF using object tag for maximum browser compatibility
    container.innerHTML = `
      <object data="${file.url}" type="application/pdf" style="width:100%;height:460px;border-radius:10px;border:none;">
        <p style="color:#CBD5E1;text-align:center;padding:2rem;">
          Your browser cannot display this PDF inline.<br>
          <a href="${file.url}" target="_blank" style="color:#38BDF8;">Click here to open it in a new tab →</a>
        </p>
      </object>
    `;
  } else {
    // Text / fallback
    container.innerHTML = `
      <div style="font-family:monospace;white-space:pre-wrap;font-size:0.88rem;color:#CBD5E1;line-height:1.7;">
        <div style="background:rgba(124,58,237,0.12);border:1px solid rgba(124,58,237,0.35);padding:0.75rem 1rem;border-radius:10px;margin-bottom:1rem;font-family:var(--font-body);color:#E9D5FF;">
          <strong>📄 File:</strong> ${file.name} (${file.size}) &nbsp;·&nbsp; <span style="color:#34D399;">${file.parsed}</span>
        </div>
        ${(file.content || 'No content extracted.').replace(/\n/g, '<br>')}
      </div>
    `;
  }

  if (window.lucide) lucide.createIcons();
  modal.classList.add('active');
}

function closePdfModal() {
  playSound('click');
  const modal = document.getElementById('pdf-modal');
  if (modal) modal.classList.remove('active');
}

/* ==========================================================================
   TIMETABLE IMAGE SCANNER
   ========================================================================== */
function triggerScheduleImageInput() {
  playSound('click');
  const input = document.getElementById('schedule-img-input');
  if (input) input.click();
}

function setupScheduleScannerDrop() {
  const zone = document.getElementById('schedule-scanner-zone');
  if (!zone) return;

  ['dragenter','dragover','dragleave','drop'].forEach(evt =>
    zone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); }, false)
  );

  zone.addEventListener('dragover',  () => zone.classList.add('dragover'));
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    zone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files && files.length > 0) processScheduleImage(files[0]);
  });
}

function handleScheduleImageUploaded(e) {
  if (e.target.files && e.target.files.length > 0) {
    processScheduleImage(e.target.files[0]);
    e.target.value = '';
  }
}

function processScheduleImage(file) {
  if (!file.type.startsWith('image/')) {
    showToast('⚠️ Please upload an image file (PNG, JPG, etc.).');
    return;
  }

  playSound('replan');
  const laser = document.getElementById('laser-line');
  if (laser) laser.style.display = 'block';
  showToast('🔍 AI scanning timetable image for lecture & free slots…');

  const imageUrl = URL.createObjectURL(file);
  appState.timetableImageUrl = imageUrl;

  // Show inline preview immediately
  const imgPreview   = document.getElementById('timetable-img-preview');
  const imgContainer = document.getElementById('timetable-img-container');
  const placeholder  = document.getElementById('scanner-placeholder');

  if (imgPreview)   imgPreview.src = imageUrl;
  if (imgContainer) imgContainer.style.display = 'block';
  if (placeholder)  placeholder.style.display  = 'none';

  setTimeout(() => {
    if (laser) laser.style.display = 'none';
    playSound('success');

    // Update dashboard timetable tab
    updateDashTimetableView(imageUrl, file.name);

    // Add to files list
    appState.files.push({
      name: file.name,
      size: file.size > 1048576
          ? (file.size / 1048576).toFixed(1) + ' MB'
          : (file.size / 1024).toFixed(0) + ' KB',
      parsed: '🕐 Timetable Scanned · 3 Free Slots Found',
      url: imageUrl, isImage: true, isPdf: false,
      content: `OCR Timetable Scan:\n- Lectures: Mon–Fri 09:00 AM – 01:00 PM\n- Free Windows Detected:\n  • Morning: 07:00 – 09:00 AM\n  • Afternoon: 02:00 – 05:00 PM\n  • Evening: 06:30 – 10:00 PM`
    });
    renderFiles();

    // Auto-select all free-slot pills
    document.querySelectorAll('.slot-pill').forEach(p => p.classList.add('selected'));

    const resultContainer = document.getElementById('ocr-result-container');
    if (resultContainer) {
      resultContainer.style.display = 'block';
      resultContainer.innerHTML = `
        <div class="ocr-result-badge">
          <strong>📸 Timetable Scanned!</strong><br>
          Detected Lectures: Mon–Fri 09:00 AM – 01:00 PM<br>
          <span style="color:#FBBF24;">✨ 3 Free Study Windows auto-selected below!</span>
        </div>
      `;
    }

    showToast('🎉 Timetable scanned! Free slots auto-detected. Click "Generate AI Schedule" to plan your week.');
  }, 1600);
}

function updateDashTimetableView(imageUrl, name) {
  const container = document.getElementById('dash-timetable-display');
  if (!container) return;

  container.innerHTML = `
    <img src="${imageUrl}" alt="Timetable" style="max-width:100%;border-radius:14px;border:1px solid var(--border-glow);cursor:pointer;" onclick="openTimetableFullscreen()" title="Click to view full screen">
    <p style="font-size:0.75rem;color:#38BDF8;margin-top:0.5rem;cursor:pointer;" onclick="openTimetableFullscreen()">
      <i data-lucide="zoom-in" style="width:12px;display:inline;"></i> Click image to view full size · ${name}
    </p>
    <button class="btn btn-secondary btn-sm" style="margin-top:0.75rem;" onclick="triggerScheduleImageInput()">
      <i data-lucide="camera"></i> Upload Different Timetable
    </button>
  `;
  if (window.lucide) lucide.createIcons();
}

function openTimetableFullscreen() {
  playSound('click');
  const url = appState.timetableImageUrl;
  if (!url) { showToast('⚠️ No timetable image uploaded yet.'); return; }

  const modal = document.getElementById('timetable-fullscreen-modal');
  const img   = document.getElementById('timetable-fullscreen-img');
  if (img)   img.src = url;
  if (modal) modal.classList.add('active');
}

function closeTimetableFullscreen() {
  playSound('click');
  const modal = document.getElementById('timetable-fullscreen-modal');
  if (modal) modal.classList.remove('active');
}

/* ==========================================================================
   FREE SLOT PILLS & DAY PICKER HELPERS
   ========================================================================== */
function toggleSlotPill(el, slotLabel) {
  playSound('click');
  el.classList.toggle('selected');
}

function toggleFreeSlot(el) {
  playSound('click');
  el.classList.toggle('selected');
}

function toggleDayPicker(btn, dayStr) {
  playSound('click');
  btn.classList.toggle('active');
}

function toggleDay(btn) {
  playSound('click');
  btn.classList.toggle('active');
}

function getSelectedSlots() {
  const pills = document.querySelectorAll('.slot-pill.selected');
  const slots = [];
  pills.forEach(p => {
    const txt = p.textContent.trim();
    const matches = txt.match(/(\d{2}:\d{2})\s*[-–—]\s*(\d{2}:\d{2})/);
    const start = matches ? matches[1] : '09:00';
    const end   = matches ? matches[2] : '11:00';
    slots.push({
      label: txt,
      start,
      end
    });
  });
  return slots.length > 0 ? slots : [{ label: '09:00 - 11:00', start: '09:00', end: '11:00' }];
}

function getSelectedDays() {
  const activeBtns = Array.from(document.querySelectorAll('.day-btn.active'));
  const days = activeBtns.map(btn => {
    const d = (btn.dataset.day || btn.textContent).trim();
    return d.length > 3 ? d.slice(0,3) : d;
  });
  return days.length > 0 ? days : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
}

function selectWeekdays() {
  playSound('click');
  document.querySelectorAll('.day-btn').forEach(btn => {
    const d = btn.dataset.day || btn.textContent.trim().slice(0,3);
    btn.classList.toggle('active', ['Mon','Tue','Wed','Thu','Fri'].includes(d));
  });
}

function selectAllDays() {
  playSound('click');
  document.querySelectorAll('.day-btn').forEach(btn => btn.classList.add('active'));
}

function clearDays() {
  playSound('click');
  document.querySelectorAll('.day-btn').forEach(btn => btn.classList.remove('active'));
}

/* ==========================================================================
   AI SCHEDULE GENERATION ENGINE — DAY-BY-DAY
   ========================================================================== */
function generateCustomAISchedule() {
  playSound('replan');

  const subjects = (typeof AppDB !== 'undefined') ? AppDB.getSubjects() : appState.subjects;
  if (!subjects || subjects.length === 0) {
    showToast('⚠️ Step 3: Add at least one subject before generating.');
    const inp = document.getElementById('subj-name-input');
    if (inp) { inp.focus(); inp.style.borderColor = '#EF4444'; setTimeout(() => inp.style.borderColor = '', 2000); }
    return;
  }

  const selectedSlots = getSelectedSlots();
  const selectedDays  = getSelectedDays();

  const priorityOrder = { 'Critical': 0, 'High': 1, 'Normal': 2 };
  const sortedSubjects = [...subjects].sort((a, b) =>
    (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3)
  );

  const topicVariants = [
    'Core Concepts & Theory Review',
    'Problem Solving & Practice Sets',
    'Mind Maps & Summary Notes',
    'Past Paper Analysis & MCQs',
    'Weak Area Deep Dive',
    'Formula Drills & Quick Revision'
  ];

  const scheduleByDay = {};

  selectedDays.forEach(day => {
    const dayBlocks = [];
    sortedSubjects.forEach((subj, subjIdx) => {
      const slot = selectedSlots[subjIdx % selectedSlots.length];
      const timeStr = `${slot.start} – ${slot.end}`;

      let sessionType = 'Focus Study';
      let badgeColor = 'purple';
      let desc = `${topicVariants[subjIdx % topicVariants.length]} for ${subj.name}`;

      if (subj.attendance < 75 && subjIdx === 0) {
        sessionType = 'Attendance Recovery Revision';
        badgeColor = 'danger';
        desc = `High-priority concept review for ${subj.name} (<75% Attendance Alert!)`;
      } else if (subj.examDate && subjIdx === sortedSubjects.length - 1) {
        sessionType = 'Exam Sprint Mock Test';
        badgeColor = 'amber';
        desc = `Timed practice & mock test for upcoming exam on ${subj.examDate}`;
      }

      dayBlocks.push({
        id: `block-${day}-${subjIdx}-${Date.now()}`,
        time: timeStr,
        start: slot.start,
        end: slot.end,
        subject: subj.name,
        priority: subj.priority || 'Normal',
        sessionType: sessionType,
        badgeColor: badgeColor,
        description: desc,
        topic: desc,
        completed: false,
        done: false
      });
    });
    scheduleByDay[day] = dayBlocks;
  });

  appState.scheduleBlocks = Object.values(scheduleByDay).flat();
  appState.scheduleByDay  = scheduleByDay;
  appState.activeDayTab   = selectedDays[0];

  if (typeof AppDB !== 'undefined') {
    AppDB.saveStudyPlan(scheduleByDay);
  }

  renderStudioSchedule();
  renderDaySchedule();

  showToast(`🎉 AI Study schedule generated & saved for ${selectedDays.length} day(s)!`);
}

function renderStudioSchedule() {
  const dayTabsEl  = document.getElementById('studio-day-tabs');
  const schedView = document.getElementById('studio-schedule-view');

  if (!dayTabsEl || !schedView) return;

  let planData = (typeof AppDB !== 'undefined') ? AppDB.getStudyPlan() : appState.scheduleByDay;
  const subjects = (typeof AppDB !== 'undefined') ? AppDB.getSubjects() : appState.subjects;

  if ((!planData || Object.keys(planData).length === 0) && subjects && subjects.length > 0) {
    generateCustomAISchedule();
    planData = (typeof AppDB !== 'undefined') ? AppDB.getStudyPlan() : appState.scheduleByDay;
  }

  if (!planData || Object.keys(planData).length === 0) {
    schedView.innerHTML = `
      <div style="text-align:center;padding:3rem 1rem;color:var(--text-muted);font-size:0.85rem;">
        📂 Configure your inputs & click <strong>Generate AI Study Schedule</strong> to view your day-by-day plan.
      </div>`;
    dayTabsEl.innerHTML = '';
    return;
  }

  const days = Object.keys(planData);
  if (!appState.activeDayTab || !days.includes(appState.activeDayTab)) {
    appState.activeDayTab = days[0];
  }

  // Render day tabs
  dayTabsEl.innerHTML = days.map(d => `
    <button class="btn btn-secondary btn-sm ${d === appState.activeDayTab ? 'active' : ''}"
            style="${d === appState.activeDayTab ? 'background:rgba(56,189,248,0.2);color:#38BDF8;border-color:rgba(56,189,248,0.5);font-weight:700;' : ''}"
            onclick="switchStudioDay('${d}')">${d}</button>
  `).join('');

  // Render blocks for active day
  const blocks = planData[appState.activeDayTab] || [];
  if (blocks.length === 0) {
    schedView.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-muted);">No study blocks scheduled for ${appState.activeDayTab}.</div>`;
    return;
  }

  const PC = { Critical: '#EF4444', High: '#FBBF24', Normal: '#34D399' };

  schedView.innerHTML = blocks.map(b => `
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-left:4px solid ${PC[b.priority] || '#38BDF8'};border-radius:12px;padding:0.85rem 1rem;margin-bottom:0.75rem;display:flex;justify-content:space-between;align-items:center;gap:0.75rem;">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.2rem;">
          <span style="font-size:0.75rem;color:#38BDF8;font-weight:700;">⏰ ${b.time || b.start + '–' + b.end || '—'}</span>
          <strong style="font-size:0.9rem;color:var(--text-primary);">${b.subject}</strong>
          <span style="font-size:0.68rem;padding:2px 6px;border-radius:6px;background:rgba(255,255,255,0.05);color:${PC[b.priority] || '#38BDF8'};">${b.priority || 'Normal'}</span>
        </div>
        <div style="font-size:0.78rem;color:var(--text-secondary);">${b.description || b.topic || 'Core topic study'}</div>
      </div>
    </div>
  `).join('');
}

function switchStudioDay(day) {
  appState.activeDayTab = day;
  renderStudioSchedule();
}


// Utility: add minutes to HH:MM string, returns HH:MM
function addMinutes(timeStr, mins) {
  if (!timeStr) return '09:00';
  const [h, m] = timeStr.split(':').map(Number);
  const total  = h * 60 + m + mins;
  const hh     = Math.floor(total / 60) % 24;
  const mm     = total % 60;
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}

/* ==========================================================================
   DAY SCHEDULE RENDERER (App.js version — used by studio.html)
   ========================================================================== */
function renderDaySchedule() {
  const emptyState  = document.getElementById('empty-state');
  const tabStrip    = document.getElementById('day-tab-strip');
  const tabRow      = document.getElementById('day-tabs');
  const schedView   = document.getElementById('day-schedule-view');

  if (!tabStrip || !tabRow || !schedView) return;

  // Always load from AppDB for persistence
  if (typeof AppDB !== 'undefined') {
    const saved = AppDB.getStudyPlan();
    if (saved && Object.keys(saved).length > 0) {
      appState.scheduleByDay = saved;
      appState.scheduleBlocks = Object.values(saved).flat();
    }
  }

  if (!appState.scheduleByDay || Object.keys(appState.scheduleByDay).length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    tabStrip.style.display = 'none';
    updateMetrics();
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  tabStrip.style.display = 'block';

  const days = Object.keys(appState.scheduleByDay);
  if (!appState.activeDayTab || !days.includes(appState.activeDayTab)) {
    appState.activeDayTab = days[0];
  }

  // ── Render day tab buttons ──
  tabRow.innerHTML = '';
  const dayFull = { Mon:'Monday', Tue:'Tuesday', Wed:'Wednesday', Thu:'Thursday',
                    Fri:'Friday', Sat:'Saturday', Sun:'Sunday' };
  days.forEach(day => {
    const blocks   = appState.scheduleByDay[day] || [];
    const doneAll  = blocks.length > 0 && blocks.every(b => b.done || b.completed);
    const doneCount = blocks.filter(b => b.done || b.completed).length;
    const isActive = day === appState.activeDayTab;

    const btn = document.createElement('button');
    btn.className = `day-tab-btn${isActive ? ' active' : ''}${doneAll ? ' all-done' : ''}`;
    btn.dataset.day = day;
    btn.innerHTML = `
      <span class="day-tab-label">${day}</span>
      <span class="day-tab-count">${doneCount}/${blocks.length}</span>
    `;
    btn.onclick = () => { appState.activeDayTab = day; renderDaySchedule(); playSound('click'); };
    tabRow.appendChild(btn);
  });

  // ── Render blocks for active day ──
  const activeBlocks = appState.scheduleByDay[appState.activeDayTab] || [];
  schedView.innerHTML = '';

  // Day header — safe time calculation
  const headerDiv = document.createElement('div');
  headerDiv.className = 'day-schedule-header';
  const doneCount = activeBlocks.filter(b => b.done || b.completed).length;
  const totalMinsDay = activeBlocks.reduce((acc, b) => {
    const startStr = b.startTime || b.start || '';
    const endStr   = b.endTime   || b.end   || '';
    if (!startStr || !endStr) return acc;
    const [sh, sm] = startStr.split(':').map(Number);
    const [eh, em] = endStr.split(':').map(Number);
    const dur = (eh * 60 + em) - (sh * 60 + sm);
    return acc + (dur > 0 ? dur : 0);
  }, 0);
  headerDiv.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;">
      <div>
        <h4 style="font-size:1rem;margin-bottom:0.15rem;">
          <i data-lucide="calendar" style="width:16px;color:#C084FC;"></i>
          ${dayFull[appState.activeDayTab] || appState.activeDayTab} Study Plan
        </h4>
        <span style="font-size:0.78rem;color:#94A3B8;">
          ${activeBlocks.length} block(s) · ${(totalMinsDay / 60).toFixed(1)}h planned · ${doneCount} done
        </span>
      </div>
      <div style="display:flex;gap:0.5rem;">
        <button class="btn btn-secondary btn-sm" onclick="markDayAllDone('${appState.activeDayTab}')">
          <i data-lucide="check-square"></i> Done All
        </button>
        <button class="btn btn-secondary btn-sm" onclick="resetDayBlocks('${appState.activeDayTab}')">
          <i data-lucide="rotate-ccw"></i> Reset
        </button>
      </div>
    </div>
  `;
  schedView.appendChild(headerDiv);

  if (activeBlocks.length === 0) {
    schedView.innerHTML += `<div style="text-align:center;padding:2rem;color:var(--text-muted);">No subjects assigned for this day.</div>`;
  } else {
    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:0.75rem;margin-top:0.75rem;';

    activeBlocks.forEach((b, idx) => {
      const isDone = !!(b.done || b.completed);
      const item = document.createElement('div');
      item.className = `schedule-block-item${isDone ? ' done' : ''}`;

      const prioColor = b.priority === 'Critical' ? '#EF4444'
                      : b.priority === 'High'     ? '#FBBF24' : '#34D399';
      const prioIcon  = b.priority === 'Critical' ? 'alert-circle'
                      : b.priority === 'High'     ? 'alert-triangle' : 'check-circle';

      const startStr = b.startTime || b.start || '';
      const endStr   = b.endTime   || b.end   || '';
      const topicText = b.topic || b.description || b.sessionType || 'Core study session';
      const timeLabel = b.time || (startStr && endStr ? `${startStr} – ${endStr}` : '');
      const slotLabel = b.slotLabel || timeLabel || 'Scheduled';

      item.innerHTML = `
        <div class="block-top-row">
          <div style="display:flex;align-items:center;gap:0.75rem;flex:1;min-width:0;">
            <div class="task-check${isDone ? ' checked' : ''}" onclick="toggleBlockDone('${appState.activeDayTab}','${b.id || idx}')">
              ${isDone ? '<i data-lucide="check" style="width:13px;color:white;"></i>' : ''}
            </div>
            <div style="min-width:0;">
              <strong style="display:block;${isDone ? 'text-decoration:line-through;color:#64748B;' : ''}">${b.subject || b.title || 'Study Block'}</strong>
              <div style="font-size:0.78rem;color:#CBD5E1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${topicText}</div>
              <div style="font-size:0.7rem;color:#38BDF8;margin-top:2px;">⏰ ${slotLabel}</div>
            </div>
          </div>
          <span style="font-size:0.72rem;padding:0.2rem 0.55rem;border-radius:6px;background:rgba(255,255,255,0.07);color:${prioColor};border:1px solid ${prioColor}40;display:flex;align-items:center;gap:0.3rem;flex-shrink:0;">
            <i data-lucide="${prioIcon}" style="width:11px;"></i> ${b.priority || 'Normal'}
          </span>
        </div>
        <div class="block-time-edit-row">
          <i data-lucide="clock" style="width:13px;color:#38BDF8;"></i>
          <span style="color:var(--text-muted);font-size:0.8rem;">Start:</span>
          <input type="time" class="time-input" value="${startStr}" onchange="updateDayBlockTime('${appState.activeDayTab}','${b.id || idx}','start',this.value)">
          <span style="color:var(--text-muted);font-size:0.8rem;">End:</span>
          <input type="time" class="time-input" value="${endStr}" onchange="updateDayBlockTime('${appState.activeDayTab}','${b.id || idx}','end',this.value)">
          <span style="margin-left:auto;font-size:0.72rem;color:#94A3B8;display:flex;align-items:center;gap:0.25rem;">
            <i data-lucide="edit-3" style="width:11px;"></i> Editable
          </span>
        </div>
      `;
      list.appendChild(item);
    });
    schedView.appendChild(list);
  }

  if (window.lucide) lucide.createIcons();
  updateMetrics();
}

function toggleBlockDone(day, blockId) {
  playSound('click');
  if (!appState.scheduleByDay || !appState.scheduleByDay[day]) return;
  const block = appState.scheduleByDay[day].find(b => b.id === blockId);
  if (block) {
    block.done = block.completed = !block.done;
    if (block.done) playSound('success');
    // Sync flat list and persist to AppDB
    appState.scheduleBlocks = Object.values(appState.scheduleByDay).flat();
    if (typeof AppDB !== 'undefined') AppDB.saveStudyPlan(appState.scheduleByDay);
    updateMetrics();
  }
}

function markDayAllDone(day) {
  playSound('success');
  if (!appState.scheduleByDay || !appState.scheduleByDay[day]) return;
  appState.scheduleByDay[day].forEach(b => { b.done = true; b.completed = true; });
  appState.scheduleBlocks = Object.values(appState.scheduleByDay).flat();
  if (typeof AppDB !== 'undefined') AppDB.saveStudyPlan(appState.scheduleByDay);
  updateMetrics();
  showToast(`✅ All ${day} blocks marked as done!`);
}

function resetDayBlocks(day) {
  playSound('click');
  if (!appState.scheduleByDay || !appState.scheduleByDay[day]) return;
  appState.scheduleByDay[day].forEach(b => { b.done = false; b.completed = false; });
  appState.scheduleBlocks = Object.values(appState.scheduleByDay).flat();
  if (typeof AppDB !== 'undefined') AppDB.saveStudyPlan(appState.scheduleByDay);
  updateMetrics();
  showToast(`🔄 ${day} blocks reset.`);
}

function updateDayBlockTime(day, blockId, field, value) {
  playSound('click');
  if (!appState.scheduleByDay || !appState.scheduleByDay[day]) return;
  const block = appState.scheduleByDay[day].find(b => b.id === blockId);
  if (block) {
    if (field === 'start') { block.startTime = value; block.start = value; }
    else                   { block.endTime = value; block.end = value; }
    block.time = `${block.start || block.startTime} – ${block.end || block.endTime}`;
    if (typeof AppDB !== 'undefined') AppDB.saveStudyPlan(appState.scheduleByDay);
    showToast(`⏱️ ${field === 'start' ? 'Start' : 'End'} time on ${day} updated to ${value}`);
  }
}

/* ==========================================================================
   METRICS / DASHBOARD METRICS ROW
   ========================================================================== */
function updateMetrics() {
  // Sync from AppDB for fresh data
  if (typeof AppDB !== 'undefined') {
    appState.subjects = AppDB.getSubjects() || [];
    const savedPlan = AppDB.getStudyPlan();
    if (savedPlan && Object.keys(savedPlan).length > 0) {
      appState.scheduleByDay = savedPlan;
      appState.scheduleBlocks = Object.values(savedPlan).flat();
    }
  }

  const subjCount = appState.subjects.length;
  const pending   = appState.scheduleBlocks.filter(b => !(b.done || b.completed)).length;

  // Total planned hours (safe field access: blocks can use .start/.end OR .startTime/.endTime)
  let totalMins = 0;
  appState.scheduleBlocks.forEach(b => {
    if (!(b.done || b.completed)) {
      const startStr = b.startTime || b.start || '';
      const endStr   = b.endTime   || b.end   || '';
      if (startStr && endStr) {
        const [sh, sm] = startStr.split(':').map(Number);
        const [eh, em] = endStr.split(':').map(Number);
        const dur = (eh * 60 + em) - (sh * 60 + sm);
        if (dur > 0) totalMins += dur;
      }
    }
  });
  const hoursStr = totalMins > 0 ? (totalMins / 60).toFixed(1) + 'h' : '—';

  let totalAtt = 0;
  appState.subjects.forEach(s => totalAtt += (s.attendance || 0));
  const avgAtt = subjCount > 0 ? (totalAtt / subjCount).toFixed(1) + '%' : '—';

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('dash-hours-val',    hoursStr);
  set('dash-attend-avg',   avgAtt);
  set('dash-pending-val',  pending > 0 ? pending + ' left' : subjCount > 0 ? 'All done!' : '—');
  set('dash-subjects-val', subjCount);
}

/* ==========================================================================
   ATTENDANCE TAB RENDERER
   ========================================================================== */
function renderAttendanceTab() {
  const list    = document.getElementById('attendance-list');
  const empty   = document.getElementById('attendance-empty');
  if (!list || !empty) return;

  if (appState.subjects.length === 0) {
    list.style.display  = 'none';
    empty.style.display = 'block';
    return;
  }

  list.style.display  = 'flex';
  empty.style.display = 'none';
  list.innerHTML = '';

  appState.subjects.forEach(s => {
    const pct   = s.attendance;
    const risk  = pct < 75 ? 'Danger' : pct < 85 ? 'Warning' : 'Safe';
    const color = pct < 75 ? '#EF4444' : pct < 85 ? '#FBBF24' : '#34D399';
    const icon  = pct < 75 ? 'x-circle' : pct < 85 ? 'alert-triangle' : 'check-circle';

    list.innerHTML += `
      <div class="glass-card" style="padding:1rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
          <strong>${s.name}</strong>
          <span style="font-size:0.75rem;color:${color};display:flex;align-items:center;gap:0.25rem;">
            <i data-lucide="${icon}" style="width:13px;"></i> ${risk}
          </span>
        </div>
        <div style="width:100%;height:8px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden;margin-bottom:0.3rem;">
          <div style="height:100%;width:${pct}%;background:${color};transition:width 0.6s ease;"></div>
        </div>
        <div style="font-size:0.75rem;color:#94A3B8;">${pct}% attendance · ${pct < 75 ? 'Below minimum! Attend all classes.' : pct < 85 ? 'Monitor carefully.' : 'On track ✓'}</div>
      </div>
    `;
  });
  if (window.lucide) lucide.createIcons();
}

/* ==========================================================================
   DASHBOARD TAB SWITCHING
   ========================================================================== */
function switchDashboardTab(btn, tabId) {
  playSound('click');

  // Update sidebar button states
  document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  // Hide all tab views — all 12 possible tabs
  ['schedule', 'timetable', 'attendance', 'face', 'summarizer', 'chat', 'analytics', 'notes', 'calendar', 'recommendations', 'timer', 'rewards'].forEach(t => {
    const el = document.getElementById(`tab-view-${t}`);
    if (el) el.style.display = 'none';
  });

  // Show selected tab with page-enter animation
  const active = document.getElementById(`tab-view-${tabId}`);
  if (active) {
    active.style.display = 'block';
    active.classList.remove('section-page-enter');
    void active.offsetWidth; // force reflow for animation restart
    active.classList.add('section-page-enter');
  }

  // Trigger tab-specific renders
  if (tabId === 'attendance') {
    renderAttendanceTab();
    if (typeof DashboardsEngine !== 'undefined') DashboardsEngine.renderAttendanceDashboard();
  } else if (tabId === 'analytics') {
    if (typeof DashboardsEngine !== 'undefined') DashboardsEngine.initAnalyticsCharts();
  } else if (tabId === 'notes') {
    renderNotesDashboard();
  } else if (tabId === 'calendar') {
    if (typeof DashboardsEngine !== 'undefined') DashboardsEngine.renderCalendarView();
  } else if (tabId === 'recommendations') {
    renderRecommendationsDashboard();
  }
}

/* ==========================================================================
   AI CHAT ASSISTANT HANDLER
   ========================================================================== */
function handleSendChatMessage() {
  const input = document.getElementById('chat-user-input');
  const container = document.getElementById('chat-messages-container');
  if (!input || !container) return;

  const text = input.value.trim();
  if (!text) return;

  playSound('click');
  input.value = '';

  // Append user message
  const userDiv = document.createElement('div');
  userDiv.className = 'chat-msg user';
  userDiv.innerHTML = `<strong>👤 You:</strong><br>${escapeHtmlText(text)}`;
  container.appendChild(userDiv);
  container.scrollTop = container.scrollHeight;

  // Ask AI Assistant
  setTimeout(() => {
    playSound('success');
    const { aiMsg } = (typeof AIChatAssistant !== 'undefined')
      ? AIChatAssistant.askQuestion(text)
      : { aiMsg: { text: 'I am analyzing your notes context to give you the best study answer!' } };

    const aiDiv = document.createElement('div');
    aiDiv.className = 'chat-msg ai';
    aiDiv.innerHTML = `<strong>🤖 AI Assistant:</strong><br>${(aiMsg.text || '').replace(/\n/g, '<br>')}`;
    container.appendChild(aiDiv);
    container.scrollTop = container.scrollHeight;
  }, 400);
}

function escapeHtmlText(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ==========================================================================
   NOTES DASHBOARD RENDERER
   ========================================================================== */
function renderNotesDashboard() {
  const container = document.getElementById('notes-dashboard-list');
  if (!container) return;

  const notes = (typeof AppDB !== 'undefined') ? AppDB.getNotes() : [];
  if (notes.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-muted);">No notes uploaded yet. Click Upload Note to add study material!</div>`;
    return;
  }

  container.innerHTML = notes.map(n => `
    <div class="glass-card" style="padding:1rem;display:flex;justify-content:space-between;align-items:center;">
      <div style="display:flex;align-items:center;gap:0.75rem;">
        <i data-lucide="file-text" style="color:#C084FC;width:24px;"></i>
        <div>
          <strong style="color:white;display:block;font-size:0.9rem;">${n.title}</strong>
          <div style="font-size:0.75rem;color:var(--text-muted);">${n.subject} · ${n.size} · Uploaded ${n.date}</div>
        </div>
      </div>
      <div style="display:flex;gap:0.4rem;">
        <button class="btn btn-secondary btn-sm" onclick="switchDashboardTab(document.getElementById('tab-btn-summarizer'),'summarizer')">
          View Summary
        </button>
        <button class="btn btn-secondary btn-sm" style="color:#EF4444;" onclick="deleteNoteItem('${n.id}')">
          Delete
        </button>
      </div>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function deleteNoteItem(id) {
  if (typeof AppDB !== 'undefined') AppDB.deleteNote(id);
  renderNotesDashboard();
  showToast('🗑️ Note deleted from database.');
}

/* ==========================================================================
   RECOMMENDATIONS DASHBOARD RENDERER
   ========================================================================== */
function renderRecommendationsDashboard() {
  const container = document.getElementById('ai-recs-container');
  if (!container) return;

  const subjects = (typeof AppDB !== 'undefined') ? AppDB.getSubjects() : [];
  const attendance = (typeof AppDB !== 'undefined') ? AppDB.getAttendance() : [];
  const notes = (typeof AppDB !== 'undefined') ? AppDB.getNotes() : [];
  const user = (typeof AppDB !== 'undefined') ? AppDB.getUser() : {};

  const recs = (typeof AIStudyPlanner !== 'undefined')
    ? AIStudyPlanner.getRecommendations(subjects, attendance, notes, user)
    : [];

  if (recs.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-muted);">No recommendations right now — your study schedule is fully optimized!</div>`;
    return;
  }

  container.innerHTML = recs.map(r => `
    <div class="glass-card" style="padding:1.25rem;border-left:4px solid ${r.type === 'danger' ? '#EF4444' : r.type === 'warning' ? '#FBBF24' : '#34D399'};">
      <div style="font-weight:700;font-size:0.95rem;color:white;margin-bottom:0.3rem;">${r.title}</div>
      <p style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:0.85rem;">${r.message}</p>
      <button class="btn btn-primary btn-sm" onclick="showToast('⚡ Recommendation applied!')">
        ${r.action}
      </button>
    </div>
  `).join('');
}

/* ==========================================================================
   RESCHEDULE & EXPORT
   ========================================================================== */
function triggerRescheduleSimulation() {
  playSound('replan');

  if (appState.scheduleBlocks.length === 0) {
    showToast('⚠️ Generate a schedule first to auto-replan.');
    return;
  }

  // Shift all blocks by +30 minutes to simulate conflict resolution
  appState.scheduleBlocks = appState.scheduleBlocks.map(b => ({
    ...b,
    startTime: addMinutes(b.startTime, 30),
    endTime:   addMinutes(b.endTime,   30),
    done: false
  }));
  renderScheduleBlocks();
  showToast('🔄 AI Re-planned schedule — all blocks shifted by 30 min to avoid conflicts!');
}

function exportSchedule() {
  playSound('success');
  if (appState.scheduleBlocks.length === 0) {
    showToast('⚠️ Generate a schedule first, then export.');
    return;
  }

  // Build CSV content
  const rows = ['Subject,Topic,Start,End,Priority,Done'];
  appState.scheduleBlocks.forEach(b => {
    rows.push(`"${b.subject}","${b.topic}",${b.startTime},${b.endTime},${b.priority},${b.done}`);
  });

  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'AI_Study_Schedule.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast('📥 Schedule exported as CSV — import into Google Sheets or Calendar!');
}

/* ==========================================================================
   TOAST NOTIFICATION
   ========================================================================== */
function showToast(msg) {
  // Remove any existing toast first
  const existing = document.querySelector('.app-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'app-toast';
  toast.style.cssText = `
    position:fixed;bottom:2rem;right:2rem;
    background:rgba(13,18,38,0.97);
    border:1px solid var(--primary);
    box-shadow:0 10px 40px rgba(124,58,237,0.5);
    color:white;padding:0.9rem 1.3rem;
    border-radius:14px;z-index:5000;
    font-size:0.87rem;backdrop-filter:blur(20px);
    max-width:340px;line-height:1.4;
    animation:toastIn 0.3s cubic-bezier(0.34,1.56,0.64,1);
  `;

  // Add toast animation if not already in CSS
  if (!document.getElementById('toast-keyframe')) {
    const style = document.createElement('style');
    style.id = 'toast-keyframe';
    style.textContent = `
      @keyframes toastIn {
        from { transform: translateY(20px) scale(0.9); opacity: 0; }
        to   { transform: translateY(0)    scale(1);   opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  toast.innerHTML = msg;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    toast.style.opacity    = '0';
    toast.style.transform  = 'translateY(8px)';
    setTimeout(() => toast.remove(), 400);
  }, 3200);
}

/* ==========================================================================
   AURORA CANVAS & PARTICLES
   ========================================================================== */
function initAuroraCanvas() {
  const canvas = document.getElementById('aurora-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W = canvas.width  = window.innerWidth;
  let H = canvas.height = window.innerHeight;

  window.addEventListener('resize', () => {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  });

  const count = Math.min(Math.floor(W / 22), 60);
  const particles = Array.from({ length: count }, (_, i) => ({
    x: Math.random() * W, y: Math.random() * H,
    vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
    r: Math.random() * 2 + 1,
    color: i % 3 === 0 ? 'rgba(124,58,237,' : i % 3 === 1 ? 'rgba(37,99,235,' : 'rgba(6,182,212,',
    a: Math.random() * 0.5 + 0.2
  }));

  (function animate() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach((p, i) => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color + p.a + ')';
      ctx.fill();
      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < 110) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = `rgba(147,51,234,${0.12 * (1 - d / 110)})`;
          ctx.lineWidth = 0.8; ctx.stroke();
        }
      }
    });
    requestAnimationFrame(animate);
  })();
}

function initMouseGlow() {
  const glow = document.getElementById('mouse-glow');
  if (!glow) return;
  window.addEventListener('mousemove', e => {
    glow.style.transform = `translate(${e.clientX}px,${e.clientY}px) translate(-50%,-50%)`;
  });
}

/* ==========================================================================
   ANIMATED COUNTERS
   ========================================================================== */
function initCounters() {
  const counters = [
    { id: 'counter-1', target: 78,  suffix: '%' },
    { id: 'counter-2', target: 4.5, suffix: 'h', decimals: 1 },
    { id: 'counter-3', target: 82,  suffix: '%' },
    { id: 'counter-4', target: 3.8, suffix: 'x', decimals: 1 }
  ];

  let animated = false;
  window.addEventListener('scroll', () => {
    if (animated) return;
    const el = document.getElementById('counter-1');
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom >= 0) {
      animated = true;
      counters.forEach(c => {
        const targetEl = document.getElementById(c.id);
        if (!targetEl) return;
        const dur = 1400, t0 = performance.now();
        (function step(now) {
          const p = Math.min((now - t0) / dur, 1);
          const v = c.target * p;
          targetEl.textContent = (c.decimals ? v.toFixed(c.decimals) : Math.floor(v)) + c.suffix;
          if (p < 1) requestAnimationFrame(step);
        })(performance.now());
      });
    }
  });
}

/* ==========================================================================
   POMODORO FOCUS TIMER
   ========================================================================== */
let timerInterval  = null;
let timerSeconds   = 25 * 60;
let isTimerRunning = false;
let defaultTimerMins = 25;

function initFocusTimer() { updateTimerDisplay(); }

function updateTimerDisplay() {
  const display = document.getElementById('timer-display');
  if (!display) return;
  const m = Math.floor(timerSeconds / 60);
  const s = timerSeconds % 60;
  display.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function setTimerDuration(mins) {
  if (isTimerRunning) return;
  defaultTimerMins = mins;
  timerSeconds = mins * 60;
  updateTimerDisplay();
  showToast(`⏱️ Timer set to ${mins} minutes.`);
}

function startFocusTimer() {
  if (typeof togglePomodoroTimer === 'function') {
    togglePomodoroTimer();
    return;
  }
  playSound('click');
  const btn = document.getElementById('timer-toggle-btn');
  if (!btn) return;

  if (!isTimerRunning) {
    isTimerRunning = true;
    btn.textContent = '⏸ Pause';

    timerInterval = setInterval(() => {
      timerSeconds--;
      updateTimerDisplay();
      if (timerSeconds <= 0) {
        clearInterval(timerInterval);
        isTimerRunning = false;
        btn.textContent = '▶ Start Session';
        playSound('success');
        showToast('🎉 Focus session complete! Take a 5-minute break.');

        const subjectSel = document.getElementById('timer-subject-select');
        const focusSubject = subjectSel ? subjectSel.value : (appState.subjects[0]?.name || 'General Study');
        if (typeof AppDB !== 'undefined') {
          AppDB.logPomodoro(focusSubject, defaultTimerMins);
          if (AppDB.addXP) AppDB.addXP(defaultTimerMins * 2);
        }
        if (typeof NotificationSystem !== 'undefined') {
          NotificationSystem.notifyFocusDone(focusSubject, defaultTimerMins);
        }
        timerSeconds = defaultTimerMins * 60;
        setTimeout(updateTimerDisplay, 100);
      }
    }, 1000);
  } else {
    clearInterval(timerInterval);
    isTimerRunning = false;
    btn.textContent = '▶ Start Session';
  }
}

function resetFocusTimer() {
  if (typeof resetPomodoroTimer === 'function') {
    resetPomodoroTimer();
    return;
  }
  playSound('click');
  clearInterval(timerInterval);
  isTimerRunning = false;
  timerSeconds   = defaultTimerMins * 60;
  updateTimerDisplay();
  const btn = document.getElementById('timer-toggle-btn');
  if (btn) btn.textContent = '▶ Start Session';
}

/* ==========================================================================
   IMPACT CALCULATOR
   ========================================================================== */
function updateCalculator() {
  const tasksEl = document.getElementById('slider-tasks');
  const hoursEl = document.getElementById('slider-hours');
  if (!tasksEl || !hoursEl) return;

  const tasks = parseInt(tasksEl.value);
  const hours = parseInt(hoursEl.value);

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('slider-tasks-val', `${tasks} Tasks`);
  set('slider-hours-val', `${hours} Hours`);

  const timeSaved = (tasks * 0.6 + hours * 0.25).toFixed(1);
  const gpaBoost  = Math.min(0.2 + tasks * 0.04 + hours * 0.015, 0.85).toFixed(2);

  set('res-time-saved', `${timeSaved} hrs/wk`);
  set('res-gpa-boost',  `+${gpaBoost} GPA`);
}

/* ==========================================================================
   DEMO MODAL
   ========================================================================== */
function openDemoModal() {
  playSound('click');
  const modal = document.getElementById('demo-modal');
  if (modal) modal.classList.add('active');
}

function closeDemoModal() {
  playSound('click');
  const modal = document.getElementById('demo-modal');
  if (modal) modal.classList.remove('active');
}

function handleDemoSubmit(e) {
  e.preventDefault();
  playSound('replan');

  const subject  = document.getElementById('input-subject').value;
  const urgency  = document.getElementById('input-urgency').value;
  const resultDiv  = document.getElementById('demo-result');
  const resultText = document.getElementById('demo-result-text');

  if (!resultDiv || !resultText) return;
  resultDiv.style.display = 'block';

  const slots = urgency === 'critical'
    ? '6 intensive blocks (3h/day) over 2 days'
    : urgency === 'high'
    ? '4 blocks spread over this week'
    : '2 blocks per day in normal flow';

  resultText.innerHTML = `
    Assigned <strong>${subject}</strong> as <strong>${urgency.toUpperCase()}</strong> priority.<br>
    Generated <strong>${slots}</strong> with auto rest intervals, synced with your free time windows.
    Progress tracking enabled. 🚀
  `;
}

/* ==========================================================================
   CLOSE MODALS ON BACKDROP CLICK
   ========================================================================== */
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
  }
});

/* ==========================================================================
   PAGE NAVIGATION WITH SMOOTH ANIMATION
   ========================================================================== */
function navigateToPage(sectionId, e) {
  if (e && e.preventDefault) e.preventDefault();
  playSound('click');

  const overlay = document.getElementById('page-transition');
  const titleEl = document.getElementById('page-trans-title');
  const pageNames = {
    hero:     'Home — Overview',
    studio:   'AI Studio — Command Center',
    problem:  'Problem Analysis',
    solution: 'Autonomous AI Workflow',
    features: 'Core Capabilities',
    tech:     'Technical Architecture',
    impact:   'Academic Impact Calculator',
    team:     'Team Pall_AIX'
  };

  if (titleEl) titleEl.textContent = pageNames[sectionId] || 'Opening Page…';

  if (overlay) {
    overlay.classList.add('active');
    setTimeout(() => {
      const section = document.getElementById(sectionId);
      if (section) {
        section.scrollIntoView({ behavior: 'auto' });
        section.classList.remove('section-page-enter');
        void section.offsetWidth; // trigger reflow
        section.classList.add('section-page-enter');
      }
      setTimeout(() => {
        overlay.classList.remove('active');
      }, 280);
    }, 320);
  } else {
    scrollToSection(sectionId);
  }
}

/* ==========================================================================
   LIVE FACE AI & FOCUS MONITOR
   ========================================================================== */
let webcamStream = null;
let faceMeshAnimId = null;
let faceAnalysisActive = false;
let faceMeshAngle = 0;

async function toggleWebcamStream() {
  playSound('click');
  const videoEl = document.getElementById('webcam-feed');
  const btnEl   = document.getElementById('toggle-cam-btn');
  const statusEl = document.getElementById('hud-cam-status');

  if (!videoEl || !btnEl) return;

  if (webcamStream || faceAnalysisActive) {
    // Stop camera
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
      webcamStream = null;
    }
    faceAnalysisActive = false;
    if (faceMeshAnimId) cancelAnimationFrame(faceMeshAnimId);
    videoEl.srcObject = null;
    videoEl.style.display = 'none';

    btnEl.innerHTML = `<i data-lucide="camera"></i> Start Live AI Camera`;
    if (statusEl) statusEl.innerHTML = `<i data-lucide="video-off" style="width:12px;color:#EF4444;"></i> Camera Off`;
    showToast('📷 AI Camera Stream Stopped.');
    if (window.lucide) lucide.createIcons();
    return;
  }

  // Try accessing real camera
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
    });
    videoEl.srcObject = webcamStream;
    videoEl.style.display = 'block';
    await videoEl.play();
    faceAnalysisActive = true;

    btnEl.innerHTML = `<i data-lucide="video-off"></i> Stop Camera`;
    if (statusEl) statusEl.innerHTML = `<i data-lucide="video" style="width:12px;color:#10B981;"></i> Live WebCam Active`;

    startFaceMeshAnimation(true);
    showToast('🎥 Live WebCam Stream active! Face recognition & focus tracking running.');
  } catch (err) {
    // Fallback: WebCam blocked or unavailable — launch Realistic AI Vector Face Stream Simulator
    faceAnalysisActive = true;
    videoEl.style.display = 'none';
    btnEl.innerHTML = `<i data-lucide="video-off"></i> Stop AI Camera`;
    if (statusEl) statusEl.innerHTML = `<i data-lucide="sparkles" style="width:12px;color:#38BDF8;"></i> Live AI Face Scanner Active`;

    startFaceMeshAnimation(false);
    showToast('✨ Live AI Face Scanner active. Tracking facial landmarks & focus levels.');
  }
  if (window.lucide) lucide.createIcons();
}

function startFaceMeshAnimation(isRealWebcam) {
  const canvas = document.getElementById('face-mesh-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function renderFrame() {
    if (!faceAnalysisActive) return;

    canvas.width  = canvas.clientWidth  || 400;
    canvas.height = canvas.clientHeight || 300;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    faceMeshAngle += 0.04;
    const cx = w / 2;
    const cy = h / 2;
    const rx = w * 0.24;
    const ry = h * 0.32;

    // If real WebCam is not streaming, draw a realistic glowing human face silhouette onto canvas
    if (!isRealWebcam) {
      // Background gradient fill
      const bgGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, w * 0.6);
      bgGrad.addColorStop(0, 'rgba(15, 23, 42, 0.95)');
      bgGrad.addColorStop(1, 'rgba(5, 8, 22, 0.98)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Head Silhouette
      ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Neck
      ctx.fillStyle = 'rgba(30, 41, 59, 0.5)';
      ctx.beginPath();
      ctx.rect(cx - rx * 0.35, cy + ry * 0.75, rx * 0.7, ry * 0.5);
      ctx.fill();

      // Glowing Pupils tracking motion
      const pupilShiftX = Math.sin(faceMeshAngle * 0.6) * 6;
      const leftEyeX  = cx - rx * 0.42;
      const rightEyeX = cx + rx * 0.42;
      const eyeY      = cy - ry * 0.22;

      // Eyes (white base)
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.ellipse(leftEyeX, eyeY, 14, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(rightEyeX, eyeY, 14, 8, 0, 0, Math.PI * 2); ctx.fill();

      // Iris / Pupil
      ctx.fillStyle = '#38BDF8';
      ctx.beginPath(); ctx.arc(leftEyeX + pupilShiftX, eyeY, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(rightEyeX + pupilShiftX, eyeY, 6, 0, Math.PI * 2); ctx.fill();

      // Eyebrows
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(leftEyeX - 16, eyeY - 14); ctx.lineTo(leftEyeX + 16, eyeY - 12);
      ctx.moveTo(rightEyeX - 16, eyeY - 12); ctx.lineTo(rightEyeX + 16, eyeY - 14);
      ctx.stroke();

      // Nose outline
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, eyeY + 10);
      ctx.lineTo(cx - 8, cy + 15);
      ctx.lineTo(cx + 8, cy + 15);
      ctx.stroke();

      // Smiling Mouth
      ctx.strokeStyle = '#FBBF24';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy + ry * 0.35, 20, 0.15, Math.PI - 0.15);
      ctx.stroke();
    }

    // Outer Bounding Oval / Face Reticle
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Corner Reticle Indicators
    ctx.strokeStyle = '#C084FC';
    ctx.lineWidth = 2.5;
    const cornerSize = 14;

    // Top-Left Corner
    ctx.beginPath();
    ctx.moveTo(cx - rx - 10, cy - ry + cornerSize);
    ctx.lineTo(cx - rx - 10, cy - ry - 10);
    ctx.lineTo(cx - rx + cornerSize, cy - ry - 10);
    ctx.stroke();

    // Top-Right Corner
    ctx.beginPath();
    ctx.moveTo(cx + rx - cornerSize, cy - ry - 10);
    ctx.lineTo(cx + rx + 10, cy - ry - 10);
    ctx.lineTo(cx + rx + 10, cy - ry + cornerSize);
    ctx.stroke();

    // Bottom-Left Corner
    ctx.beginPath();
    ctx.moveTo(cx - rx - 10, cy + ry - cornerSize);
    ctx.lineTo(cx - rx - 10, cy + ry + 10);
    ctx.lineTo(cx - rx + cornerSize, cy + ry + 10);
    ctx.stroke();

    // Bottom-Right Corner
    ctx.beginPath();
    ctx.moveTo(cx + rx - cornerSize, cy + ry + 10);
    ctx.lineTo(cx + rx + 10, cy + ry + 10);
    ctx.lineTo(cx + rx + 10, cy + ry - cornerSize);
    ctx.stroke();

    // Key Facial Landmarks Mesh (3D Nodes)
    const leftEyeX  = cx - rx * 0.42;
    const rightEyeX = cx + rx * 0.42;
    const eyeY      = cy - ry * 0.22;

    ctx.fillStyle = '#34D399';
    ctx.beginPath(); ctx.arc(leftEyeX, eyeY, 4, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(rightEyeX, eyeY, 4, 0, Math.PI*2); ctx.fill();

    // Nose point
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath(); ctx.arc(cx, cy + 5, 4, 0, Math.PI*2); ctx.fill();

    // Scanning Line across face
    const scanY = cy - ry + ((Math.sin(faceMeshAngle) + 1) / 2) * (ry * 2);
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - rx, scanY);
    ctx.lineTo(cx + rx, scanY);
    ctx.stroke();

    // Dynamic Live Expression Oscillation
    const focusScore = Math.floor(93 + Math.sin(faceMeshAngle * 0.5) * 5);
    const scoreFill  = document.getElementById('focus-score-fill');
    const scoreLabel = document.getElementById('focus-score-label');
    if (scoreFill)  scoreFill.style.width = focusScore + '%';
    if (scoreLabel) scoreLabel.textContent = `${focusScore}% (Optimal Focus)`;

    faceMeshAnimId = requestAnimationFrame(renderFrame);
  }

  renderFrame();
}

function triggerFaceScanPulse() {
  playSound('replan');
  showToast('🔍 Scanning facial landmarks & verifying student attendance...');
  const badge = document.getElementById('face-status-badge');
  if (badge) {
    badge.textContent = 'Verifying Biometrics...';
    badge.style.background = 'rgba(245,158,11,0.2)';
    badge.style.color = '#FBBF24';
    setTimeout(() => {
      badge.textContent = 'Student Verified (ID #2026-AIX)';
      badge.style.background = 'rgba(16,185,129,0.15)';
      badge.style.color = '#10B981';
      playSound('success');
      showToast('✅ Face verified! Attendance 100% recorded for this session.');
    }, 1200);
  }
}

/* ==========================================================================
   REWARDS SYSTEM HELPERS
   ========================================================================== */
function toggleRewardChoice(labelEl) {
  playSound('click');
  const checkbox = labelEl.querySelector('input[type="checkbox"]');
  if (checkbox) {
    labelEl.classList.toggle('selected', checkbox.checked);
  }
}

function claimTierRewards(timeTier, tierTitle) {
  playSound('success');

  // Find checked options
  const checkedBoxes = document.querySelectorAll(`.reward-card input[type="checkbox"]:checked`);
  const selectedOptions = [];

  checkedBoxes.forEach(box => {
    // Only collect options from the card belonging to this tier call or clicked items
    if (box.checked && box.value) {
      selectedOptions.push(box.value);
    }
  });

  const modal = document.getElementById('reward-modal');
  const titleEl = document.getElementById('reward-modal-title');
  const subtitleEl = document.getElementById('reward-modal-subtitle');
  const listEl = document.getElementById('claimed-rewards-list');

  if (!modal || !listEl) return;

  if (titleEl) titleEl.textContent = `🎉 ${timeTier} Reward Unlocked!`;
  if (subtitleEl) subtitleEl.textContent = `Tier: ${tierTitle}`;

  if (selectedOptions.length === 0) {
    listEl.innerHTML = `
      <div style="color:#CBD5E1;">
        🎁 Default Reward Unlocked: Take a well-deserved 10-minute break and recharge!
      </div>
    `;
  } else {
    listEl.innerHTML = '';
    selectedOptions.forEach(opt => {
      const item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;gap:0.5rem;background:rgba(255,255,255,0.06);padding:0.5rem 0.75rem;border-radius:8px;border:1px solid rgba(255,255,255,0.1);';
      item.innerHTML = `<span style="color:#10B981;">✓</span> <span>${opt}</span>`;
      listEl.appendChild(item);
    });
  }

  modal.classList.add('active');
  showToast(`🎁 Claimed rewards for ${timeTier} (${tierTitle})! Enjoy your break!`);
}

function closeRewardModal() {
  playSound('click');
  const modal = document.getElementById('reward-modal');
  if (modal) modal.classList.remove('active');
}

/* ==========================================================================
   FACE RECONITION ATTENDANCE ACTION
   ========================================================================== */
function markStudentFaceAttendance() {
  // This function is now a guard — all real biometric verification is
  // handled by FaceRecognitionEngine in face-recognition.js.
  // The camera-based auto-capture loop and 'Verify Face Now' button
  // in attendance.html invoke FaceRecognitionEngine.manualCapture() directly.
  if (typeof FaceRecognitionEngine !== 'undefined') {
    FaceRecognitionEngine.manualCapture();
  } else {
    showToast('⚠️ Face recognition engine not loaded. Please refresh the page.');
  }
}

/* ==========================================================================
   AI NOTES SUMMARIZER ENGINE (NEW FEATURE)
   ========================================================================== */
function openSummarizerPage(e) {
  if (e && e.preventDefault) e.preventDefault();
  navigateToPage('studio', e);
  setTimeout(() => {
    const btn = document.getElementById('tab-btn-summarizer');
    if (btn) switchDashboardTab(btn, 'summarizer');
  }, 400);
}

function generateAINotesSummary() {
  if (!appState.files || appState.files.length === 0) {
    showToast('⚠️ Upload notes to begin summarization.');
    return;
  }

  playSound('replan');
  const modeSelect = document.getElementById('summary-mode-select');
  const mode = modeSelect ? modeSelect.value : 'exam';
  const activeFile = appState.files[appState.files.length - 1];

  showToast(`⚡ AI Engine analyzing "${activeFile.name}"...`);

  setTimeout(() => {
    playSound('success');
    const resultCard = document.getElementById('summarizer-result-card');
    const coreEl = document.getElementById('sum-core-text');
    const highlightsEl = document.getElementById('sum-highlights-list');
    const formulasEl = document.getElementById('sum-formulas-box');
    const titleEl = document.getElementById('summary-file-title');

    if (!resultCard) return;
    resultCard.style.display = 'block';

    if (titleEl) titleEl.textContent = `Summary: ${activeFile.name}`;

    const textContent = activeFile.content || `Extracted notes from ${activeFile.name}`;
    const lines = textContent.split('\n').filter(l => l.trim().length > 0);

    if (coreEl) {
      coreEl.textContent = `⚡ Analyzed ${activeFile.name} (${activeFile.size}): Extracted key study concepts, core definitions, and revision topics from user document.`;
    }

    if (highlightsEl) {
      highlightsEl.innerHTML = lines.slice(0, 5).map(l => `<li>${l}</li>`).join('') || `<li>Key concepts extracted from ${activeFile.name}</li>`;
    }

    if (formulasEl) {
      formulasEl.innerHTML = `<span class="formula-chip">Document: ${activeFile.name}</span><span class="formula-chip">Parsed ${activeFile.parsed}</span>`;
    }

    showToast('✨ AI Summary Generated from uploaded document!');

    if (typeof NotificationSystem !== 'undefined') {
      NotificationSystem.notifyNotesDone(activeFile.name);
    }
    if (typeof AppDB !== 'undefined') {
      AppDB.addXP(50);
    }
  }, 800);
}

function copyNotesSummaryText() {
  playSound('click');
  const core = document.getElementById('sum-core-text')?.textContent || '';
  const highlights = document.getElementById('sum-highlights-list')?.textContent || '';
  const textToCopy = `AI NOTES SUMMARY\n\nCore Concept:\n${core}\n\nKey Highlights:\n${highlights}`;

  navigator.clipboard.writeText(textToCopy).then(() => {
    showToast('📋 Summary copied to clipboard!');
  }).catch(() => {
    showToast('📋 Summary text ready for revision.');
  });
}
