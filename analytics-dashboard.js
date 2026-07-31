/**
 * ====================================================================
 * ANALYTICS DASHBOARD ENGINE — analytics-dashboard.js
 * Personal Study Planner Agent | Team Pall_AIX
 *
 * Pulls REAL data strictly from AppDB (user inputs & activities).
 * Displays clean empty states when no data is available:
 *  - "No analytics available yet."
 *  - "No attendance records available."
 *  - "Upload your timetable to generate your study plan."
 * ====================================================================
 */

// ─── Module-level state ─────────────────────────────────────────────
let _period  = 'week';
let _subjId  = 'all';

const _charts = {}; // keyed by canvas id → Chart instance

// ─── Utility helpers ────────────────────────────────────────────────
function _destroyChart(id) {
  if (_charts[id]) {
    _charts[id].destroy();
    delete _charts[id];
  }
}

function _safe(fn, fallback) {
  try { return fn(); } catch (e) { return fallback; }
}

function _emptyState(msg) {
  return `<div style="font-size:0.85rem;color:var(--text-muted);padding:2rem 1rem;text-align:center;opacity:0.8;">
    <i data-lucide="inbox" style="width:28px;height:28px;margin-bottom:0.5rem;opacity:0.4;display:block;margin-left:auto;margin-right:auto;"></i>
    ${msg}
  </div>`;
}

// ─── Public: set period filter ───────────────────────────────────────
function setPeriod(period, btn) {
  _period = period;
  document.querySelectorAll('.analytics-period-btn').forEach(b => {
    b.classList.remove('btn-primary');
    b.classList.add('btn-secondary');
  });
  if (btn) {
    btn.classList.remove('btn-secondary');
    btn.classList.add('btn-primary');
  }
  renderAllAnalytics();
}

// ─── Populate subject dropdown ────────────────────────────────────────
function _populateSubjectFilter() {
  const sel = document.getElementById('analytics-subject-filter');
  if (!sel) return;
  const subjects = _safe(() => AppDB.getSubjects(), []);
  let html = '<option value="all">All Subjects</option>';
  subjects.forEach(s => {
    html += `<option value="${s.id}">${s.name}</option>`;
  });
  sel.innerHTML = html;
}

// ─── Master render function ──────────────────────────────────────────
function renderAllAnalytics() {
  if (typeof AppDB === 'undefined') return;

  const sel = document.getElementById('analytics-subject-filter');
  _subjId = sel ? sel.value : 'all';

  const allSubjects   = _safe(() => AppDB.getSubjects(), []);
  const attendanceLogs = _safe(() => AppDB.getAttendance(), []);
  const analytics     = _safe(() => AppDB.getAnalytics(), {});
  const pomodoroLogs  = _safe(() => AppDB.getPomodoroHistory(), []);
  const user          = _safe(() => AppDB.getUser(), {});
  const notes         = _safe(() => AppDB.getNotes(), []);

  const subjects = _subjId === 'all'
    ? allSubjects
    : allSubjects.filter(s => s.id === _subjId);

  const dailyHours  = analytics.dailyHours  || [];
  const weekTotal   = dailyHours.reduce((a, d) => a + (d.hours || 0), 0);
  const focusMins   = analytics.totalFocusMinutes || 0;
  const totalHours  = focusMins / 60;
  const prodScore   = analytics.productivityScore || 0;
  const focusScore  = analytics.focusScore       || 0;
  const streak      = user.streak || 0;

  const avgAtt = attendanceLogs.length > 0 && subjects.length > 0
    ? (subjects.reduce((a, s) => a + (s.attendance || 0), 0) / subjects.length).toFixed(1)
    : null;

  const avgCompleted = subjects.length
    ? Math.round(subjects.reduce((a, s) => a + (100 - (s.remainingSyllabus || 0)), 0) / subjects.length)
    : 0;

  const remainingTopics = subjects.reduce((a, s) => a + Math.round((s.remainingSyllabus || 0) / 5), 0);

  // ── KPIs ───────────────────────────────────────────────────────────
  _renderKPIs({
    period: _period, weekTotal, totalHours, dailyHours, pomodoroLogs,
    avgAtt, avgCompleted, remainingTopics, prodScore, focusScore, streak, subjectsCount: subjects.length
  });

  // ── Charts ─────────────────────────────────────────────────────────
  _renderStudyHoursChart(subjects, dailyHours, pomodoroLogs);
  _renderSubjectDistribution(subjects, pomodoroLogs);
  _renderAttendanceTrend(subjects, attendanceLogs);
  _renderSyllabusRadar(subjects);

  // ── Lists & Text ───────────────────────────────────────────────────
  _renderHeatmap(pomodoroLogs);
  _renderSubjectPerformance(subjects);
  _renderAIInsights(subjects, user, avgAtt, streak, notes);
  _renderSubjectAttendanceBars(subjects, attendanceLogs);
  _renderRevisionProgress(subjects);

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ─── KPI Cards ────────────────────────────────────────────────────────
function _renderKPIs({ period, weekTotal, totalHours, dailyHours, pomodoroLogs,
                       avgAtt, avgCompleted, remainingTopics, prodScore, focusScore, streak, subjectsCount }) {

  const el = id => document.getElementById(id);

  if (el('kpi-hours')) {
    el('kpi-hours').textContent = totalHours > 0 ? totalHours.toFixed(1) + 'h' : '0.0h';
  }
  if (el('kpi-hours-trend')) {
    el('kpi-hours-trend').textContent = totalHours > 0 ? `Live study time` : 'No hours recorded';
  }

  if (el('kpi-att')) {
    el('kpi-att').textContent = avgAtt !== null ? avgAtt + '%' : '—';
  }
  if (el('kpi-att-status')) {
    const attEl = el('kpi-att-status');
    if (avgAtt === null) {
      attEl.textContent = 'No attendance records available';
      attEl.style.color = '#94A3B8';
    } else {
      const num = parseFloat(avgAtt);
      if (num < 75) { attEl.textContent = '⚠️ Below 75%'; attEl.style.color = '#EF4444'; }
      else { attEl.textContent = '✅ Safe Standing'; attEl.style.color = '#34D399'; }
    }
  }

  if (el('kpi-syllabus')) {
    el('kpi-syllabus').textContent = subjectsCount > 0 ? avgCompleted + '%' : '—';
  }
  if (el('kpi-syllabus-sub')) {
    el('kpi-syllabus-sub').textContent = subjectsCount > 0 ? `${remainingTopics} topics remaining` : 'Upload timetable to start';
  }

  if (el('kpi-productivity')) {
    el('kpi-productivity').textContent = prodScore > 0 ? prodScore + '%' : '—';
  }
  if (el('kpi-focus-sub')) {
    el('kpi-focus-sub').textContent = pomodoroLogs.length > 0 ? `Sessions: ${pomodoroLogs.length}` : 'No focus sessions yet';
  }

  if (el('kpi-streak')) {
    el('kpi-streak').textContent = streak + 'd';
  }
  if (el('kpi-streak-sub')) {
    el('kpi-streak-sub').textContent = streak > 0 ? 'Active Study Streak 🔥' : 'Start studying to build streak';
  }
}

// ─── Chart 1: Study Hours Bar ─────────────────────────────────────────
function _renderStudyHoursChart(subjects, dailyHours, pomodoroLogs) {
  _destroyChart('chart-hours');
  const canvas = document.getElementById('chart-hours');
  if (!canvas) return;

  if (dailyHours.length === 0 && pomodoroLogs.length === 0) {
    const parent = canvas.parentElement;
    if (parent) parent.innerHTML = _emptyState('No analytics available yet. Complete focus sessions to view study time.');
    return;
  }

  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const data   = labels.map(d => (dailyHours.find(h => h.day === d) || { hours: 0 }).hours);

  _charts['chart-hours'] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Hours Studied',
        data,
        backgroundColor: '#7C3AEDBB',
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: '#94A3B8' }, grid: { display: false } },
        y: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
      }
    }
  });
}

// ─── Chart 2: Subject Distribution Doughnut ─────────────────────
function _renderSubjectDistribution(subjects, pomodoroLogs) {
  _destroyChart('chart-subjects');
  const canvas = document.getElementById('chart-subjects');
  if (!canvas) return;

  if (subjects.length === 0 || pomodoroLogs.length === 0) {
    const parent = canvas.parentElement;
    if (parent) parent.innerHTML = _emptyState('No study distribution available. Log focus sessions per subject to populate.');
    return;
  }

  const labels = subjects.map(s => s.name);
  const data   = subjects.map(s => {
    return pomodoroLogs.filter(p => (p.subject || '').toLowerCase() === s.name.toLowerCase()).length * 25;
  });

  _charts['chart-subjects'] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: subjects.map(s => s.color || '#38BDF8') }]
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '60%' }
  });
}

// ─── Chart 3: Attendance Trend ─────────────────────────────────────────
function _renderAttendanceTrend(subjects, attendanceLogs) {
  _destroyChart('chart-attendance');
  const canvas = document.getElementById('chart-attendance');
  if (!canvas) return;

  if (attendanceLogs.length === 0 || subjects.length === 0) {
    const parent = canvas.parentElement;
    if (parent) parent.innerHTML = _emptyState('No attendance records available.');
    return;
  }

  const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
  const datasets = subjects.map(s => ({
    label: s.name,
    data: [s.attendance, s.attendance, s.attendance, s.attendance],
    borderColor: s.color || '#38BDF8',
    tension: 0.3
  }));

  _charts['chart-attendance'] = new Chart(canvas, {
    type: 'line',
    data: { labels: weeks, datasets },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

// ─── Chart 4: Syllabus Radar ───────────────────────────────────────────
function _renderSyllabusRadar(subjects) {
  _destroyChart('chart-radar');
  const canvas = document.getElementById('chart-radar');
  if (!canvas) return;

  if (subjects.length === 0) {
    const parent = canvas.parentElement;
    if (parent) parent.innerHTML = _emptyState('Upload your timetable to generate your study plan & syllabus progress.');
    return;
  }

  const labels    = subjects.map(s => s.name);
  const completed = subjects.map(s => Math.max(0, 100 - (s.remainingSyllabus || 0)));

  _charts['chart-radar'] = new Chart(canvas, {
    type: 'radar',
    data: {
      labels,
      datasets: [{ label: 'Completed %', data: completed, borderColor: '#C084FC', backgroundColor: 'rgba(192,132,252,0.2)' }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

// ─── Productivity Heatmap ─────────────────────────────────────────────
function _renderHeatmap(pomodoroLogs) {
  const container = document.getElementById('heatmap-container');
  if (!container) return;

  if (pomodoroLogs.length === 0) {
    container.innerHTML = _emptyState('No analytics available yet. Start focus sessions to populate your productivity heatmap.');
    return;
  }

  const days  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weeks = 7;
  const now   = new Date();

  let html = `<div style="display:flex;gap:5px;">`;
  html += `<div style="display:flex;flex-direction:column;gap:4px;margin-right:6px;">`;
  days.forEach(d => {
    html += `<div style="height:14px;font-size:0.63rem;color:#64748B;line-height:14px;">${d}</div>`;
  });
  html += `</div>`;

  for (let w = 0; w < weeks; w++) {
    html += `<div style="display:flex;flex-direction:column;gap:4px;">`;
    for (let d = 0; d < 7; d++) {
      const targetDate = new Date(now);
      targetDate.setDate(now.getDate() - (weeks - 1 - w) * 7 - (6 - d));
      const dateStr = targetDate.toISOString().split('T')[0];
      const pomos   = pomodoroLogs.filter(p => p.date === dateStr);
      const intensity = pomos.length > 0 ? Math.min(1, pomos.reduce((a, p) => a + (p.duration || 25), 0) / 150) : 0;
      const alpha     = intensity > 0 ? (0.2 + intensity * 0.8).toFixed(2) : '0.06';

      html += `<div title="${dateStr}: ${pomos.length} session(s)"
        style="width:14px;height:14px;border-radius:3px;background:rgba(124,58,237,${alpha});"></div>`;
    }
    html += `</div>`;
  }
  html += `</div>`;
  container.innerHTML = html;
}

// ─── Subject Performance ──────────────────────────────────────────────
function _renderSubjectPerformance(subjects) {
  const container = document.getElementById('subject-performance-list');
  if (!container) return;

  if (subjects.length === 0) {
    container.innerHTML = _emptyState('Upload your timetable to generate your study plan.');
    return;
  }

  const rows = subjects.map(s => `
    <div style="padding:0.75rem;margin-bottom:0.5rem;background:rgba(15,23,42,0.4);border:1px solid rgba(255,255,255,0.06);border-radius:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="font-weight:600;font-size:0.88rem;color:white;">${s.name}</div>
        <div style="font-size:0.75rem;color:#38BDF8;">${s.priority || 'Normal'} Priority</div>
      </div>
    </div>`);
  container.innerHTML = rows.join('');
}

// ─── AI Performance Insights ──────────────────────────────────────────
function _renderAIInsights(subjects, user, avgAtt, streak, notes) {
  const container = document.getElementById('ai-insights-list');
  if (!container) return;

  if (subjects.length === 0 && notes.length === 0) {
    container.innerHTML = _emptyState('Upload notes or timetable to generate AI insights.');
    return;
  }

  const insights = [];

  if (notes.length > 0) {
    insights.push({
      icon: 'file-text', color: '#34D399',
      title: `${notes.length} Document(s) Analyzed`,
      desc: 'Your uploaded notes have been converted to exam cheat sheets and flashcards.'
    });
  }

  if (subjects.length > 0) {
    insights.push({
      icon: 'book-open', color: '#38BDF8',
      title: `${subjects.length} Course(s) Active`,
      desc: 'AI study schedule is actively monitoring deadlines and priority topics.'
    });
  }

  container.innerHTML = insights.map(item => `
    <div style="display:flex;gap:0.65rem;align-items:flex-start;padding:0.7rem;margin-bottom:0.45rem;background:rgba(15,23,42,0.4);border:1px solid rgba(255,255,255,0.06);border-radius:12px;">
      <div style="padding:0.4rem;border-radius:8px;background:${item.color}18;color:${item.color};flex-shrink:0;">
        <i data-lucide="${item.icon}" style="width:16px;height:16px;"></i>
      </div>
      <div>
        <div style="font-weight:600;font-size:0.83rem;color:white;">${item.title}</div>
        <div style="font-size:0.76rem;color:var(--text-muted);line-height:1.5;">${item.desc}</div>
      </div>
    </div>`).join('');
}

// ─── Subject Attendance Bars ─────────────────────────────────────────
function _renderSubjectAttendanceBars(subjects, attendanceLogs) {
  const container = document.getElementById('subject-att-bars');
  if (!container) return;

  if (attendanceLogs.length === 0 || subjects.length === 0) {
    container.innerHTML = _emptyState('No attendance records available.');
    return;
  }

  container.innerHTML = subjects.map(s => {
    const pct = s.attendance || 0;
    return `
      <div>
        <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:0.3rem;">
          <span style="color:white;">${s.name}</span>
          <span style="color:#34D399;">${pct}%</span>
        </div>
        <div style="height:6px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:#34D399;"></div>
        </div>
      </div>`;
  }).join('');
}

// ─── Revision Progress Bars ────────────────────────────────────────────
function _renderRevisionProgress(subjects) {
  const container = document.getElementById('revision-progress');
  if (!container) return;

  if (subjects.length === 0) {
    container.innerHTML = _emptyState('Upload your timetable to generate your study plan.');
    return;
  }

  container.innerHTML = subjects.map(s => {
    const completed = 100 - (s.remainingSyllabus || 0);
    return `
      <div>
        <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:0.3rem;">
          <span style="color:white;">${s.name}</span>
          <span style="color:#C084FC;">${completed}% completed</span>
        </div>
        <div style="height:6px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${completed}%;background:#C084FC;"></div>
        </div>
      </div>`;
  }).join('');
}

// ─── Bootstrap ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  _populateSubjectFilter();
  renderAllAnalytics();
});
