/**
 * ================================================================
 * SMART NOTIFICATION SYSTEM — notifications.js
 * Personal Study Planner Agent | Team Pall_AIX
 *
 * Features:
 *  · 11 notification types (classes, exams, assignments, study,
 *    revision, attendance, AI plan, daily goal, focus done,
 *    notes done, system)
 *  · Notification Center panel (slide-in, animated)
 *  · Bell icon with unread badge — injected into every page navbar
 *  · Mark read / delete / clear-all / mark-all-read
 *  · Priority sort: critical → warning → info → success
 *  · Category tabs: All / Academic / Attendance / Planner / AI / System
 *  · Real-time auto-generation from AppDB data
 *  · Persisted to AppDB localStorage (notifications array)
 *  · Toast integration with existing showToast()
 *  · Public API for cross-module calls
 * ================================================================
 */

const NotificationSystem = (() => {

  /* ── Constants ────────────────────────────────────────────── */
  const TYPES = {
    UPCOMING_CLASS:  'upcoming_class',
    UPCOMING_EXAM:   'upcoming_exam',
    ASSIGNMENT:      'assignment',
    STUDY_SESSION:   'study_session',
    REVISION:        'revision',
    ATTENDANCE_WARN: 'attendance_warn',
    AI_STUDY_PLAN:   'ai_study_plan',
    DAILY_GOAL:      'daily_goal',
    FOCUS_DONE:      'focus_done',
    NOTES_DONE:      'notes_done',
    SYSTEM:          'system'
  };

  const CATS = {
    ACADEMIC:      { label: 'Academic',   color: '#38BDF8', icon: 'book-open' },
    ATTENDANCE:    { label: 'Attendance', color: '#EF4444', icon: 'user-check' },
    STUDY_PLANNER: { label: 'Planner',   color: '#C084FC', icon: 'calendar' },
    AI:            { label: 'AI',        color: '#34D399', icon: 'sparkles' },
    SYSTEM:        { label: 'System',    color: '#94A3B8', icon: 'bell' }
  };

  const PRIORITY_ORDER = { critical: 0, warning: 1, info: 2, success: 3 };

  /* ── Internal state ──────────────────────────────────────── */
  let _open   = false;
  let _filter = 'all';

  /* ── Storage helpers ─────────────────────────────────────── */
  function _load() {
    try {
      const raw = localStorage.getItem('study_planner_notifications');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function _save(list) {
    try {
      // Keep at most 100 notifications
      const trimmed = list.slice(0, 100);
      localStorage.setItem('study_planner_notifications', JSON.stringify(trimmed));
    } catch {}
  }

  function _unreadCount() { return _load().filter(n => !n.read).length; }

  /* ── Build a notification object ─────────────────────────── */
  function _make({ type, category, priority, title, message, link }) {
    return {
      id:        'n' + Date.now() + Math.random().toString(36).slice(2, 6),
      type:      type     || TYPES.SYSTEM,
      category:  category || 'SYSTEM',
      priority:  priority || 'info',
      title:     title    || 'Notification',
      message:   message  || '',
      link:      link     || null,
      read:      false,
      createdAt: new Date().toISOString()
    };
  }

  /* ── Relative time ───────────────────────────────────────── */
  function _ago(iso) {
    if (!iso) return 'now';
    const s = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (s < 60)   return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  function _daysUntil(dateStr) {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr) - Date.now()) / 86400000);
  }

  /* ── Auto-generate from AppDB ────────────────────────────── */
  function _autoGenerate() {
    if (typeof AppDB === 'undefined') return 0;

    const subjects  = _try(() => AppDB.getSubjects(), []);
    const events    = _try(() => AppDB.getCalendarEvents(), []);
    const timetable = _try(() => AppDB.getTimetable(), { lectures: [] });
    const analytics = _try(() => AppDB.getAnalytics(), {});
    const user      = _try(() => AppDB.getUser(), {});
    const notes     = _try(() => AppDB.getNotes(), []);
    const plan      = _try(() => AppDB.getStudyPlan(), {});

    const existing = _load();
    // Deduplicate by title (reset daily — use date prefix)
    const today      = new Date().toDateString();
    const todayTitles = new Set(
      existing.filter(n => new Date(n.createdAt).toDateString() === today).map(n => n.title)
    );

    const fresh = [];

    /* 1. Attendance Warnings */
    subjects.forEach(s => {
      if (s.attendance < 75) {
        const title = `⚠️ Low Attendance: ${s.name}`;
        if (!todayTitles.has(title)) {
          const needed = Math.max(0, Math.ceil((75 * 20 - s.attendance * 20) / 100));
          fresh.push(_make({
            type: TYPES.ATTENDANCE_WARN, category: 'ATTENDANCE', priority: 'critical',
            title, link: 'attendance.html',
            message: `${s.name} attendance is ${s.attendance}% — below the 75% minimum. Attend next ${needed} class(es) immediately to avoid debarment.`
          }));
        }
      } else if (s.attendance < 80) {
        const title = `⚡ Attendance Alert: ${s.name}`;
        if (!todayTitles.has(title)) {
          fresh.push(_make({
            type: TYPES.ATTENDANCE_WARN, category: 'ATTENDANCE', priority: 'warning',
            title, link: 'attendance.html',
            message: `${s.name} attendance is ${s.attendance}%. You are close to the 75% threshold — stay consistent!`
          }));
        }
      }
    });

    /* 2. Upcoming Exam Reminders */
    subjects.filter(s => s.examDate).forEach(s => {
      const d = _daysUntil(s.examDate);
      if (d !== null && d >= 0 && d <= 14) {
        const title = `📅 Exam in ${d === 0 ? 'Today' : d + 'd'}: ${s.name}`;
        if (!todayTitles.has(title)) {
          fresh.push(_make({
            type: TYPES.UPCOMING_EXAM, category: 'ACADEMIC',
            priority: d <= 2 ? 'critical' : d <= 7 ? 'warning' : 'info',
            title, link: 'analytics.html',
            message: `${s.name} exam is on ${s.examDate}. ${s.remainingSyllabus || 0}% syllabus still remaining. ${d <= 3 ? 'Start final revision NOW.' : 'Prioritize daily sessions.'}`
          }));
        }
      }
    });

    /* 3. Assignment Deadlines */
    events.filter(e => e.type === 'assignment' || e.type === 'deadline').forEach(e => {
      const d = _daysUntil(e.date);
      if (d !== null && d >= 0 && d <= 7) {
        const title = `📋 Assignment Due: ${e.title}`;
        if (!todayTitles.has(title)) {
          fresh.push(_make({
            type: TYPES.ASSIGNMENT, category: 'ACADEMIC',
            priority: d <= 1 ? 'critical' : d <= 3 ? 'warning' : 'info',
            title, link: 'planner.html',
            message: `"${e.title}" for ${e.subject || 'your course'} is due in ${d === 0 ? 'TODAY' : d + ' day(s)'}. Submit before ${e.date}.`
          }));
        }
      }
    });

    /* 4. Today's Classes */
    const dayMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayDay = dayMap[new Date().getDay()];
    const todayLecs = (timetable.lectures || []).filter(l => l.day === todayDay);
    if (todayLecs.length > 0) {
      const title = `🎓 Today: ${todayLecs.length} Class${todayLecs.length > 1 ? 'es' : ''} Scheduled`;
      if (!todayTitles.has(title)) {
        fresh.push(_make({
          type: TYPES.UPCOMING_CLASS, category: 'ACADEMIC', priority: 'info',
          title, link: 'planner.html',
          message: `Scheduled today: ${todayLecs.map(l => `${l.subject} @ ${l.start}`).join(', ')}. Mark attendance after each class.`
        }));
      }
    }

    /* 5. Daily Study Goal */
    const goalTitle = `🎯 Daily Study Goal — ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
    if (!todayTitles.has(goalTitle)) {
      const todayKey = new Date().toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3);
      const todayTasks = (plan[todayKey] || []).length;
      const focusHrs = ((analytics.totalFocusMinutes || 0) / 60).toFixed(1);
      fresh.push(_make({
        type: TYPES.DAILY_GOAL, category: 'STUDY_PLANNER', priority: 'info',
        title: goalTitle, link: 'planner.html',
        message: `Goal: 6h study today. Logged: ${focusHrs}h so far. ${todayTasks > 0 ? todayTasks + ' tasks in today\'s plan.' : 'Open Study Planner to build today\'s schedule.'}`
      }));
    }

    /* 6. Revision Reminders for upcoming exams with pending syllabus */
    subjects.filter(s => {
      const d = _daysUntil(s.examDate);
      return d !== null && d >= 0 && d <= 7 && (s.remainingSyllabus || 0) > 20;
    }).slice(0, 2).forEach(s => {
      const title = `📖 Revision Needed: ${s.name}`;
      if (!todayTitles.has(title)) {
        fresh.push(_make({
          type: TYPES.REVISION, category: 'STUDY_PLANNER', priority: 'warning',
          title, link: 'analytics.html',
          message: `${s.remainingSyllabus}% of ${s.name} still uncovered with ${_daysUntil(s.examDate)} days to exam. Schedule an intensive revision session today.`
        }));
      }
    });

    /* 7. AI Study Plan */
    if (subjects.length > 0) {
      const planTitle = '🤖 AI Study Plan Optimized';
      if (!todayTitles.has(planTitle)) {
        fresh.push(_make({
          type: TYPES.AI_STUDY_PLAN, category: 'AI', priority: 'info',
          title: planTitle, link: 'planner.html',
          message: `Your AI study plan has been generated for ${subjects.length} subjects. Open the Study Planner to view priority-sorted sessions and smart time slots.`
        }));
      }
    }

    /* 8. Study streak milestone */
    const streak = user.streak || 0;
    if (streak > 0 && streak % 7 === 0) {
      const streakTitle = `🔥 ${streak}-Day Study Streak!`;
      if (!existing.find(n => n.title === streakTitle)) {
        fresh.push(_make({
          type: TYPES.SYSTEM, category: 'AI', priority: 'success',
          title: streakTitle, link: 'dashboard.html',
          message: `Incredible! ${streak} consecutive study days completed. You've earned +${streak * 15} bonus XP. Your dedication is paying off!`
        }));
      }
    }

    /* 9. Notes upload prompt */
    if (notes.length === 0) {
      const noNotesTitle = '📁 Upload Notes for AI Summarization';
      if (!todayTitles.has(noNotesTitle)) {
        fresh.push(_make({
          type: TYPES.NOTES_DONE, category: 'AI', priority: 'info',
          title: noNotesTitle, link: 'summarizer.html',
          message: 'No notes uploaded yet. Upload PDF, DOCX, or image notes to the AI Summarizer to instantly generate flashcards, MCQs, formulas, and exam revision guides.'
        }));
      }
    }

    /* 10. Study session reminder (afternoon) */
    const hour = new Date().getHours();
    if (hour >= 14 && hour <= 16) {
      const sessionTitle = '⏱️ Afternoon Study Session Reminder';
      if (!todayTitles.has(sessionTitle)) {
        fresh.push(_make({
          type: TYPES.STUDY_SESSION, category: 'STUDY_PLANNER', priority: 'info',
          title: sessionTitle, link: 'planner.html',
          message: 'It\'s the optimal afternoon study window (2–4 PM). Start a 25-minute Pomodoro focus session now to maximize productivity.'
        }));
      }
    }

    if (fresh.length > 0) {
      _save([..._load(), ...fresh]);
    }
    return fresh.length;
  }

  function _try(fn, fallback) {
    try { return fn(); } catch { return fallback; }
  }

  /* ── Sort by priority → date ─────────────────────────────── */
  function _sorted(list) {
    return [...list].sort((a, b) => {
      const p = (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2);
      if (p !== 0) return p;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  /* ── Update bell badge ───────────────────────────────────── */
  function _updateBadge() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    const n = _unreadCount();
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.style.display = n > 0 ? 'flex' : 'none';

    const btn = document.getElementById('notif-bell-btn');
    if (btn) btn.classList.toggle('has-unread', n > 0);
  }

  /* ── Render panel content ────────────────────────────────── */
  function _renderPanel() {
    const panel = document.getElementById('notif-panel');
    if (!panel) return;

    const all    = _load();
    const list   = _filter === 'all' ? all : all.filter(n => n.category === _filter);
    const sorted = _sorted(list);
    const unread = all.filter(n => !n.read).length;

    /* Header */
    let html = `
      <div class="ncp-header">
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <i data-lucide="bell" style="width:17px;color:#C084FC;"></i>
          <span style="font-weight:700;font-size:0.95rem;color:white;">Notifications</span>
          ${unread > 0 ? `<span class="ncp-unread-pill">${unread} new</span>` : ''}
        </div>
        <div style="display:flex;gap:0.35rem;">
          ${unread > 0 ? `<button class="ncp-icon-btn" onclick="NotificationSystem.markAllRead()" title="Mark all read">
            <i data-lucide="check-check" style="width:13px;"></i></button>` : ''}
          <button class="ncp-icon-btn" onclick="NotificationSystem.clearAll()" title="Clear all">
            <i data-lucide="trash-2" style="width:13px;"></i></button>
          <button class="ncp-icon-btn" onclick="NotificationSystem.togglePanel()" title="Close">
            <i data-lucide="x" style="width:13px;"></i></button>
        </div>
      </div>`;

    /* Category filter tabs */
    const tabs = [
      { k: 'all',           l: 'All',       cnt: all.length },
      { k: 'ACADEMIC',      l: 'Academic',  cnt: all.filter(n => n.category === 'ACADEMIC').length },
      { k: 'ATTENDANCE',    l: 'Attendance',cnt: all.filter(n => n.category === 'ATTENDANCE').length },
      { k: 'STUDY_PLANNER', l: 'Planner',   cnt: all.filter(n => n.category === 'STUDY_PLANNER').length },
      { k: 'AI',            l: 'AI',        cnt: all.filter(n => n.category === 'AI').length },
      { k: 'SYSTEM',        l: 'System',    cnt: all.filter(n => n.category === 'SYSTEM').length }
    ];

    html += `<div class="ncp-tabs">`;
    tabs.forEach(t => {
      const active = _filter === t.k;
      html += `<button class="ncp-tab${active ? ' active' : ''}" onclick="NotificationSystem.setFilter('${t.k}')">
        ${t.l}${t.cnt > 0 ? ` <span>${t.cnt}</span>` : ''}
      </button>`;
    });
    html += `</div>`;

    /* Notification list */
    html += `<div class="ncp-list">`;
    if (sorted.length === 0) {
      html += `<div class="ncp-empty">
        <i data-lucide="bell-off" style="width:30px;height:30px;opacity:0.25;margin-bottom:0.6rem;"></i>
        <div style="font-size:0.82rem;color:#64748B;">No notifications</div>
        <div style="font-size:0.72rem;color:#475569;margin-top:0.2rem;">You're all caught up! ✅</div>
      </div>`;
    } else {
      sorted.forEach(n => {
        const cat  = CATS[n.category] || CATS.SYSTEM;
        const pcol = { critical:'#EF4444', warning:'#FBBF24', success:'#34D399', info:'#38BDF8' }[n.priority] || '#38BDF8';

        html += `
          <div class="ncp-item${n.read ? '' : ' unread'}" id="ni-${n.id}">
            <div class="ncp-icon" style="background:${cat.color}1A;color:${cat.color};">
              <i data-lucide="${cat.icon}" style="width:14px;height:14px;"></i>
            </div>
            <div class="ncp-body" ${n.link ? `onclick="NotificationSystem.openLink('${n.id}','${n.link}')"` : ''} style="${n.link ? 'cursor:pointer;' : ''}">
              <div class="ncp-title">
                <span class="ncp-dot" style="background:${pcol};"></span>
                ${_esc(n.title)}
                ${!n.read ? '<span class="ncp-live"></span>' : ''}
              </div>
              <div class="ncp-msg">${_esc(n.message)}</div>
              <div class="ncp-meta">
                <span class="ncp-cat" style="color:${cat.color};background:${cat.color}14;">${cat.label}</span>
                <span>${_ago(n.createdAt)}</span>
              </div>
            </div>
            <div class="ncp-actions">
              ${!n.read ? `<button class="ncp-mini" onclick="NotificationSystem.markRead('${n.id}')" title="Mark read">
                <i data-lucide="check" style="width:11px;"></i></button>` : ''}
              <button class="ncp-mini del" onclick="NotificationSystem.del('${n.id}')" title="Delete">
                <i data-lucide="x" style="width:11px;"></i></button>
            </div>
          </div>`;
      });
    }
    html += `</div>`;

    /* Footer */
    html += `
      <div class="ncp-footer">
        <button class="ncp-refresh" onclick="NotificationSystem.refresh()">
          <i data-lucide="refresh-cw" style="width:12px;"></i> Refresh
        </button>
        <span style="font-size:0.68rem;color:#475569;">${all.length} total</span>
      </div>`;

    panel.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  }

  function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Inject CSS (once) ───────────────────────────────────── */
  function _injectCSS() {
    if (document.getElementById('ncp-css')) return;
    const s = document.createElement('style');
    s.id = 'ncp-css';
    s.textContent = `
/* ── Notification Bell ─────────────────── */
#notif-bell-wrap{position:relative;display:flex;align-items:center;}
#notif-bell-btn{
  width:38px;height:38px;border-radius:50%;
  background:rgba(124,58,237,.12);border:1px solid rgba(124,58,237,.3);
  display:flex;align-items:center;justify-content:center;
  cursor:pointer;color:#C084FC;transition:all .2s;position:relative;
  outline:none;
}
#notif-bell-btn:hover{background:rgba(124,58,237,.28);transform:scale(1.08);}
#notif-bell-btn.has-unread{animation:bellWiggle 3s ease infinite;}
@keyframes bellWiggle{
  0%,85%,100%{transform:rotate(0);}
  87%,91%,95%{transform:rotate(-10deg);}
  89%,93%,97%{transform:rotate(10deg);}
}
#notif-badge{
  position:absolute;top:-5px;right:-5px;
  min-width:17px;height:17px;padding:0 3px;
  border-radius:9px;background:#EF4444;color:#fff;
  font-size:.58rem;font-weight:800;
  display:none;align-items:center;justify-content:center;
  border:2px solid #090E1E;line-height:1;
}

/* ── Panel ─────────────────────────────── */
#notif-panel-wrap{position:fixed;top:0;left:0;width:0;height:0;z-index:9998;}
.ncp{
  position:fixed;top:68px;right:1.2rem;
  width:390px;max-width:calc(100vw - 1.5rem);max-height:82vh;
  background:rgba(7,12,28,.97);border:1px solid rgba(124,58,237,.28);
  border-radius:18px;
  box-shadow:0 30px 90px rgba(0,0,0,.85),0 0 0 1px rgba(124,58,237,.1);
  backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);
  display:flex;flex-direction:column;overflow:hidden;
  opacity:0;transform:translateY(-10px) scale(.96);pointer-events:none;
  transition:opacity .2s ease,transform .22s cubic-bezier(.34,1.56,.64,1);
  z-index:9998;
}
.ncp.open{opacity:1;transform:translateY(0) scale(1);pointer-events:all;}

/* Header */
.ncp-header{
  display:flex;justify-content:space-between;align-items:center;
  padding:.9rem 1rem .7rem;border-bottom:1px solid rgba(255,255,255,.06);
  flex-shrink:0;
}
.ncp-unread-pill{
  font-size:.62rem;font-weight:800;padding:1px 6px;border-radius:9px;
  background:rgba(239,68,68,.18);color:#EF4444;border:1px solid rgba(239,68,68,.28);
}
.ncp-icon-btn{
  width:28px;height:28px;border-radius:7px;
  background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.07);
  color:#64748B;cursor:pointer;display:flex;align-items:center;justify-content:center;
  transition:all .15s;
}
.ncp-icon-btn:hover{background:rgba(255,255,255,.1);color:#CBD5E1;}

/* Tabs */
.ncp-tabs{
  display:flex;gap:.2rem;padding:.55rem .9rem;
  border-bottom:1px solid rgba(255,255,255,.04);overflow-x:auto;flex-shrink:0;
  scrollbar-width:none;
}
.ncp-tabs::-webkit-scrollbar{display:none;}
.ncp-tab{
  padding:.22rem .55rem;border-radius:7px;border:1px solid rgba(255,255,255,.07);
  background:transparent;color:#4B5563;font-size:.68rem;font-weight:700;
  cursor:pointer;white-space:nowrap;transition:all .15s;display:flex;align-items:center;gap:.25rem;
}
.ncp-tab span{background:rgba(255,255,255,.08);border-radius:5px;padding:0 4px;font-size:.62rem;}
.ncp-tab:hover{color:#CBD5E1;background:rgba(255,255,255,.04);}
.ncp-tab.active{background:rgba(124,58,237,.2);border-color:rgba(124,58,237,.45);color:#C084FC;}

/* List */
.ncp-list{flex:1;overflow-y:auto;padding:.3rem 0;scrollbar-width:thin;scrollbar-color:rgba(124,58,237,.3) transparent;}
.ncp-list::-webkit-scrollbar{width:3px;}
.ncp-list::-webkit-scrollbar-thumb{background:rgba(124,58,237,.3);border-radius:2px;}

/* Empty */
.ncp-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2.5rem;color:#475569;}

/* Item */
.ncp-item{
  display:flex;gap:.6rem;align-items:flex-start;
  padding:.65rem 1rem;border-bottom:1px solid rgba(255,255,255,.03);
  transition:background .15s;position:relative;
}
.ncp-item:hover{background:rgba(255,255,255,.02);}
.ncp-item.unread{background:rgba(124,58,237,.04);}
.ncp-item:last-child{border-bottom:none;}
.ncp-icon{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;}
.ncp-body{flex:1;min-width:0;}
.ncp-title{font-size:.79rem;font-weight:700;color:#E2E8F0;margin-bottom:.2rem;display:flex;align-items:center;gap:.35rem;flex-wrap:wrap;}
.ncp-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0;}
.ncp-live{width:5px;height:5px;border-radius:50%;background:#38BDF8;flex-shrink:0;animation:ncpPulse 1.5s infinite;}
@keyframes ncpPulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.4;transform:scale(.7);}}
.ncp-msg{font-size:.73rem;color:#4B5563;line-height:1.5;margin-bottom:.3rem;}
.ncp-meta{display:flex;align-items:center;gap:.45rem;font-size:.67rem;color:#374151;}
.ncp-cat{padding:1px 5px;border-radius:5px;font-size:.62rem;font-weight:700;}
.ncp-actions{display:flex;flex-direction:column;gap:.2rem;flex-shrink:0;opacity:0;transition:opacity .15s;}
.ncp-item:hover .ncp-actions{opacity:1;}
.ncp-mini{
  width:22px;height:22px;border-radius:5px;
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);
  color:#475569;cursor:pointer;display:flex;align-items:center;justify-content:center;
  transition:all .15s;
}
.ncp-mini:hover{background:rgba(56,189,248,.1);color:#38BDF8;}
.ncp-mini.del:hover{background:rgba(239,68,68,.15);color:#EF4444;}

/* Footer */
.ncp-footer{
  display:flex;justify-content:space-between;align-items:center;
  padding:.55rem 1rem;border-top:1px solid rgba(255,255,255,.05);flex-shrink:0;
}
.ncp-refresh{
  display:flex;align-items:center;gap:.3rem;font-size:.72rem;
  color:#38BDF8;background:rgba(56,189,248,.07);
  border:1px solid rgba(56,189,248,.2);border-radius:7px;
  padding:.25rem .65rem;cursor:pointer;transition:all .15s;
}
.ncp-refresh:hover{background:rgba(56,189,248,.15);}

@media(max-width:480px){
  .ncp{width:calc(100vw - 1rem);right:.5rem;}
}
    `;
    document.head.appendChild(s);
  }

  /* ── Inject Bell + Panel HTML into navbar ─────────────────── */
  function _injectDOM() {
    if (document.getElementById('notif-bell-wrap')) return; // already present

    const navContainer = document.querySelector('.nav-container');
    if (!navContainer) return;

    /* Bell button */
    const bellWrap = document.createElement('div');
    bellWrap.id = 'notif-bell-wrap';
    bellWrap.innerHTML = `
      <button id="notif-bell-btn" onclick="NotificationSystem.togglePanel()" title="Notifications" aria-label="Open notification center">
        <i data-lucide="bell" style="width:17px;height:17px;"></i>
        <span id="notif-badge">0</span>
      </button>`;

    /* Insert before the primary CTA button */
    const cta = navContainer.querySelector('.btn.btn-primary');
    if (cta) navContainer.insertBefore(bellWrap, cta);
    else navContainer.appendChild(bellWrap);

    /* Panel container */
    const panelWrap = document.createElement('div');
    panelWrap.id = 'notif-panel-wrap';
    panelWrap.innerHTML = `<div class="ncp" id="notif-panel"></div>`;
    document.body.appendChild(panelWrap);

    /* Close on outside click */
    document.addEventListener('click', (e) => {
      if (!_open) return;
      if (!e.target.closest('#notif-panel') && !e.target.closest('#notif-bell-wrap')) {
        _open = false;
        document.getElementById('notif-panel')?.classList.remove('open');
      }
    }, true);

    if (window.lucide) lucide.createIcons();
  }

  /* ── Public API ──────────────────────────────────────────── */

  function togglePanel() {
    _open = !_open;
    const p = document.getElementById('notif-panel');
    if (!p) return;
    p.classList.toggle('open', _open);
    if (_open) { _renderPanel(); }
  }

  function setFilter(cat) {
    _filter = cat;
    _renderPanel();
  }

  function markRead(id) {
    const list = _load();
    const n = list.find(n => n.id === id);
    if (n) { n.read = true; _save(list); }
    _updateBadge();
    _renderPanel();
  }

  function markAllRead() {
    const list = _load();
    list.forEach(n => n.read = true);
    _save(list);
    _updateBadge();
    _renderPanel();
  }

  function del(id) {
    _save(_load().filter(n => n.id !== id));
    _updateBadge();
    _renderPanel();
  }

  function clearAll() {
    _save([]);
    _updateBadge();
    _renderPanel();
  }

  function openLink(id, link) {
    markRead(id);
    if (link) window.location.href = link;
  }

  function refresh() {
    _autoGenerate();
    _updateBadge();
    _renderPanel();
    if (typeof showToast === 'function') showToast('🔔 Notifications updated!');
  }

  /** Add a notification from any module */
  function add({ type, category, priority, title, message, link } = {}) {
    const notif = _make({ type, category, priority, title, message, link });
    const list  = _load();
    list.unshift(notif);
    _save(list);
    _updateBadge();
    if (_open) _renderPanel();
    // Show toast for critical/warning
    if ((priority === 'critical' || priority === 'warning') && typeof showToast === 'function') {
      const icons = { critical:'🚨', warning:'⚠️', info:'💡', success:'✅' };
      showToast(`${icons[priority] || '🔔'} ${title}`);
    }
    return notif;
  }

  /* Convenience wrappers for other modules */
  function notifyFocusDone(subject, duration) {
    return add({
      type: TYPES.FOCUS_DONE, category: 'STUDY_PLANNER', priority: 'success',
      title: `✅ Focus Session Complete!`, link: 'dashboard.html',
      message: `${duration}-minute Pomodoro for ${subject} done. Great work! +${Math.round(duration * 2)} XP earned. Keep your streak going!`
    });
  }

  function notifyNotesDone(fileName) {
    return add({
      type: TYPES.NOTES_DONE, category: 'AI', priority: 'success',
      title: `📝 AI Summary Ready: ${fileName}`, link: 'summarizer.html',
      message: `"${fileName}" fully analyzed. Flashcards, MCQs, formulas & revision notes are ready for review.`
    });
  }

  function notifyAttendanceMarked(studentName, subject, confidence) {
    return add({
      type: TYPES.UPCOMING_CLASS, category: 'ATTENDANCE', priority: 'success',
      title: `✅ Attendance Verified`, link: 'attendance-history.html',
      message: `Face recognized: ${studentName} — ${subject} attendance marked (${confidence?.toFixed(1) || '--'}% confidence).`
    });
  }

  function notifyRegistered(studentName) {
    return add({
      type: TYPES.SYSTEM, category: 'SYSTEM', priority: 'success',
      title: `🎓 Student Registered: ${studentName}`, link: 'register.html',
      message: `${studentName} has been successfully registered with face biometrics. Attendance tracking is now active.`
    });
  }

  /* ── Init ────────────────────────────────────────────────── */
  function init() {
    _injectCSS();
    _injectDOM();
    _autoGenerate();
    _updateBadge();

    // Auto-refresh every 5 minutes
    setInterval(() => {
      _autoGenerate();
      _updateBadge();
      if (_open) _renderPanel();
    }, 5 * 60 * 1000);
  }

  return {
    init, add, del, markRead, markAllRead, clearAll,
    togglePanel, setFilter, openLink, refresh,
    notifyFocusDone, notifyNotesDone, notifyAttendanceMarked, notifyRegistered,
    TYPES
  };

})();

/* ── Auto-boot on DOM ready ─────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Wait until AppDB is available (db.js must load before this file)
  if (typeof AppDB !== 'undefined') {
    NotificationSystem.init();
  } else {
    let attempts = 0;
    const wait = setInterval(() => {
      if (typeof AppDB !== 'undefined' || ++attempts > 10) {
        clearInterval(wait);
        if (typeof AppDB !== 'undefined') NotificationSystem.init();
      }
    }, 200);
  }
});
