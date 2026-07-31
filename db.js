/**
 * ============================================================
 * CENTRAL DATABASE PERSISTENCE ENGINE (IndexedDB / LocalStorage)
 * Handles state persistence for Users, Attendance, Subjects,
 * Notes, AI Summaries, Study Plans, Analytics, Timetable,
 * Notifications, Gamification, and Calendar.
 * Team: Pall_AIX | Personal Study Planner Agent
 * ============================================================
 */

const AppDB = (() => {
  const STORAGE_KEY = 'study_planner_db_v3';

  // Default clean database state — zero hardcoded/mock data
  const defaultState = {
    user: {
      id: '',
      name: '',
      email: '',
      level: 1,
      xp: 0,
      nextLevelXp: 100,
      streak: 0,
      lastActiveDate: '',
      badges: []
    },
    students: [],
    subjects: [],
    attendance: [],
    notes: [],
    timetable: {
      lectures: [],
      freeSlots: []
    },
    studyPlan: {},
    analytics: {
      dailyHours: [],
      productivityScore: 0,
      focusScore: 0,
      completedSessions: 0,
      totalFocusMinutes: 0
    },
    notifications: [],
    pomodoroHistory: [],
    calendarEvents: []
  };

  /* Helper to load state */
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        saveState(defaultState);
        return defaultState;
      }
      return JSON.parse(raw);
    } catch (e) {
      console.warn('DB Load Error, using fallback', e);
      return defaultState;
    }
  }

  /* Helper to save state */
  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('DB Save Error', e);
    }
  }

  return {
    getState: loadState,
    saveState: saveState,

    // User Operations
    getUser: () => {
      const state = loadState();
      let u = state.user || {};
      if ((!u.name || !u.name.trim()) && state.students && state.students.length > 0) {
        const activeStudent = state.students[state.students.length - 1];
        u = {
          ...u,
          id: activeStudent.id,
          name: activeStudent.name,
          department: activeStudent.department,
          semester: activeStudent.semester,
          email: activeStudent.email,
          phone: activeStudent.phone
        };
      }
      return u;
    },
    updateUser: (fields) => {
      const state = loadState();
      state.user = { ...state.user, ...fields };
      saveState(state);
      return state.user;
    },
    setActiveStudent: (studentId) => {
      const state = loadState();
      const student = (state.students || []).find(s => (s.id || '').trim().toLowerCase() === (studentId || '').trim().toLowerCase());
      if (student) {
        state.user = {
          ...state.user,
          id: student.id,
          name: student.name,
          department: student.department,
          semester: student.semester,
          email: student.email,
          phone: student.phone
        };
        saveState(state);
        return state.user;
      }
      return null;
    },
    addXP: (xpAmount) => {
      const state = loadState();
      state.user.xp += xpAmount;
      if (state.user.xp >= state.user.nextLevelXp) {
        state.user.level += 1;
        state.user.nextLevelXp = Math.round(state.user.nextLevelXp * 1.5);
      }
      saveState(state);
      return state.user;
    },

    // Subjects Operations
    getSubjects: () => loadState().subjects,
    addSubject: (subject) => {
      const state = loadState();
      const newSubj = {
        id: 'subj-' + Date.now(),
        name: subject.name,
        priority: subject.priority || 'Normal',
        attendance: parseFloat(subject.attendance) || 85,
        examDate: subject.examDate || '',
        difficulty: subject.difficulty || 'Medium',
        remainingSyllabus: parseInt(subject.remainingSyllabus) || 50,
        color: subject.color || '#38BDF8'
      };
      state.subjects.push(newSubj);
      saveState(state);
      return newSubj;
    },
    updateSubject: (id, fields) => {
      const state = loadState();
      const idx = state.subjects.findIndex(s => s.id === id);
      if (idx !== -1) {
        state.subjects[idx] = { ...state.subjects[idx], ...fields };
        saveState(state);
        return state.subjects[idx];
      }
      return null;
    },
    deleteSubject: (id) => {
      const state = loadState();
      state.subjects = state.subjects.filter(s => s.id !== id);
      saveState(state);
    },

    // Student Registration & Management Operations
    getStudents: () => {
      const state = loadState();
      return state.students || [];
    },
    getStudentById: (id) => {
      const state = loadState();
      return (state.students || []).find(s => (s.id || '').trim().toLowerCase() === (id || '').trim().toLowerCase());
    },
    addStudent: (studentData) => {
      const state = loadState();
      if (!state.students) state.students = [];

      const cleanId = (studentData.id || '').trim();
      const cleanName = (studentData.name || '').trim();

      if (!cleanId || !cleanName) {
        return { success: false, error: 'Student Name and Student ID are required!' };
      }

      // 1. Check duplicate Student ID
      const existingId = state.students.find(s => (s.id || '').trim().toLowerCase() === cleanId.toLowerCase());
      if (existingId) {
        return { success: false, error: `Student ID "${cleanId}" already exists in database!` };
      }

      // Helper distance function
      const calcDist = (a, b) => {
        if (!a || !b || a.length !== b.length) return 1.0;
        let sum = 0;
        for (let i = 0; i < a.length; i++) {
          const d = a[i] - b[i];
          sum += d * d;
        }
        return Math.sqrt(sum);
      };

      // 2. Check duplicate face encoding
      if (studentData.faceDescriptor && studentData.faceDescriptor.length > 0) {
        const newDesc = studentData.faceDescriptor;
        for (const existingStudent of state.students) {
          if (existingStudent.faceDescriptor && existingStudent.faceDescriptor.length > 0) {
            const dist = calcDist(newDesc, existingStudent.faceDescriptor);
            if (dist < 0.45) {
              return {
                success: false,
                error: `Duplicate Face Detected! This face matches registered student "${existingStudent.name}" (${existingStudent.id}) with match score ${(100 - dist * 100).toFixed(1)}%.`
              };
            }
          }
        }
      }

      const newStudent = {
        id: cleanId,
        name: cleanName,
        department: studentData.department || 'Computer Science',
        semester: studentData.semester || 'Semester 1',
        email: studentData.email || '',
        phone: studentData.phone || '',
        faceDescriptor: studentData.faceDescriptor ? Array.from(studentData.faceDescriptor) : null,
        registeredAt: new Date().toISOString().split('T')[0]
      };

      state.students.push(newStudent);
      state.user = {
        ...state.user,
        id: newStudent.id,
        name: newStudent.name,
        department: newStudent.department,
        semester: newStudent.semester,
        email: newStudent.email,
        phone: newStudent.phone
      };
      saveState(state);
      return { success: true, student: newStudent };
    },

    // Attendance Operations
    getAttendance: () => loadState().attendance || [],
    logAttendance: (rec) => {
      const state = loadState();
      if (!state.attendance) state.attendance = [];
      const today = rec.date || new Date().toISOString().split('T')[0];

      // Check duplicate attendance for same student on same day
      const studentIdClean = (rec.studentId || '').trim().toLowerCase();
      const existing = state.attendance.find(a => 
        (a.studentId || '').trim().toLowerCase() === studentIdClean && 
        a.date === today
      );

      if (existing) {
        return { 
          success: false, 
          isDuplicate: true, 
          reason: `Attendance already marked for ${rec.studentName} (${rec.studentId}) today!`, 
          record: existing 
        };
      }

      // Guard: never log attendance without a real verified student
      if (!rec.studentId || !rec.studentName) {
        return { success: false, reason: 'Cannot log attendance without a valid registered student.' };
      }

      const newRecord = {
        id: 'att-' + Date.now(),
        studentId: rec.studentId,
        studentName: rec.studentName,
        department: rec.department || 'Unknown',
        subject: rec.subject || 'General',
        date: today,
        time: rec.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: rec.status || 'Verified',
        confidence: rec.confidence || 0,
        antiSpoofPassed: rec.antiSpoofPassed !== false
      };

      state.attendance.unshift(newRecord);

      if (state.subjects) {
        const subj = state.subjects.find(s => s.name.toLowerCase() === (rec.subject || '').toLowerCase());
        if (subj) {
          subj.attendance = Math.min(100, Math.round((subj.attendance + 1.5) * 10) / 10);
        }
      }

      saveState(state);
      return { success: true, record: newRecord };
    },

    getAttendanceFiltered: ({ searchQuery, date, department }) => {
      const state = loadState();
      let records = state.attendance || [];

      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        records = records.filter(r =>
          (r.studentName || '').toLowerCase().includes(q) ||
          (r.studentId || '').toLowerCase().includes(q) ||
          (r.subject || '').toLowerCase().includes(q)
        );
      }

      if (date) {
        records = records.filter(r => r.date === date);
      }

      if (department && department !== 'All') {
        records = records.filter(r => (r.department || '').toLowerCase() === department.toLowerCase());
      }

      const totalRecords = records.length;
      const verifiedCount = records.filter(r => r.status === 'Verified').length;
      const uniqueStudents = new Set(records.filter(r => r.status === 'Verified').map(r => r.studentId)).size;

      return {
        records,
        totalRecords,
        verifiedCount,
        uniqueStudents,
        attendancePercentage: totalRecords > 0 ? Math.round((verifiedCount / totalRecords) * 100) : 0
      };
    },

    // Notes Operations
    getNotes: () => loadState().notes,
    addNote: (note) => {
      const state = loadState();
      const newNote = {
        id: 'note-' + Date.now(),
        title: note.title,
        subject: note.subject || 'General',
        size: note.size || '1.0 MB',
        date: new Date().toISOString().split('T')[0],
        pages: note.pages || 1,
        type: note.type || 'pdf',
        summary: note.summary || {}
      };
      state.notes.unshift(newNote);
      saveState(state);
      return newNote;
    },
    deleteNote: (id) => {
      const state = loadState();
      state.notes = state.notes.filter(n => n.id !== id);
      saveState(state);
    },

    // Timetable Operations
    getTimetable: () => loadState().timetable || { lectures: [], freeSlots: [] },
    saveTimetable: (tt) => {
      const state = loadState();
      state.timetable = tt;
      saveState(state);
      return state.timetable;
    },
    getStudyPlan: () => loadState().studyPlan || {},
    saveStudyPlan: (plan) => {
      const state = loadState();
      state.studyPlan = plan;
      saveState(state);
      return state.studyPlan;
    },

    // Notifications Operations
    getNotifications: () => loadState().notifications,
    addNotification: (notif) => {
      const state = loadState();
      const newNotif = {
        id: 'notif-' + Date.now(),
        title: notif.title,
        message: notif.message,
        type: notif.type || 'info',
        time: 'Just now',
        read: false
      };
      state.notifications.unshift(newNotif);
      saveState(state);
      return newNotif;
    },
    markNotificationsRead: () => {
      const state = loadState();
      state.notifications.forEach(n => n.read = true);
      saveState(state);
    },

    // Pomodoro History
    logPomodoro: (subject, duration) => {
      const state = loadState();
      const today = new Date().toISOString().split('T')[0];
      const rec = {
        id: 'pomo-' + Date.now(),
        subject: subject || 'General',
        duration: duration || 25,
        completedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: today
      };
      state.pomodoroHistory.unshift(rec);
      state.analytics.completedSessions += 1;
      state.analytics.totalFocusMinutes += duration;
      saveState(state);
      return rec;
    },

    // Analytics Getters
    getAnalytics: () => loadState().analytics || { dailyHours: [], productivityScore: 80, focusScore: 85, completedSessions: 0, totalFocusMinutes: 0 },

    // Pomodoro History
    getPomodoroHistory: () => loadState().pomodoroHistory || [],

    // Calendar Events
    getCalendarEvents: () => loadState().calendarEvents,
    addCalendarEvent: (evt) => {
      const state = loadState();
      const newEvt = {
        id: 'evt-' + Date.now(),
        title: evt.title,
        date: evt.date,
        type: evt.type || 'study',
        subject: evt.subject || ''
      };
      state.calendarEvents.push(newEvt);
      saveState(state);
      return newEvt;
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AppDB;
}
