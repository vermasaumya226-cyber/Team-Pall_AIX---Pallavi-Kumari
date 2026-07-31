/**
 * ================================================================
 * INTELLIGENT AI STUDY PLANNER v5.0 — Realistic Scheduler
 * Smart load balancing · Subject color-coding · Session variety
 * Team: Pall_AIX | Personal Study Planner Agent
 * ================================================================
 */

const AIStudyPlanner = (() => {

  /* ── Subject color palette (one per subject) ───────────────── */
  const PALETTE = [
    { bg:'rgba(56,189,248,0.18)',  border:'rgba(56,189,248,0.5)',  text:'#38BDF8', dot:'#38BDF8' }, // sky
    { bg:'rgba(52,211,153,0.18)',  border:'rgba(52,211,153,0.5)',  text:'#34D399', dot:'#34D399' }, // emerald
    { bg:'rgba(251,191,36,0.18)',  border:'rgba(251,191,36,0.5)',  text:'#FBBF24', dot:'#FBBF24' }, // amber
    { bg:'rgba(248,113,113,0.18)', border:'rgba(248,113,113,0.5)', text:'#F87171', dot:'#F87171' }, // rose
    { bg:'rgba(167,139,250,0.18)', border:'rgba(167,139,250,0.5)', text:'#A78BFA', dot:'#A78BFA' }, // violet
    { bg:'rgba(251,146,60,0.18)',  border:'rgba(251,146,60,0.5)',  text:'#FB923C', dot:'#FB923C' }, // orange
    { bg:'rgba(20,184,166,0.18)',  border:'rgba(20,184,166,0.5)',  text:'#2DD4BF', dot:'#2DD4BF' }, // teal
    { bg:'rgba(244,114,182,0.18)', border:'rgba(244,114,182,0.5)', text:'#F472B6', dot:'#F472B6' }, // pink
  ];

  /* ── Session type library ───────────────────────────────────── */
  const SESSION_TYPES = [
    { type:'Focus Study',      emoji:'📖', desc: s => `Deep dive into ${s.name} — cover chapter notes, concepts & key formulas` },
    { type:'Problem Solving',  emoji:'✏️', desc: s => `Work through practice questions and exercises for ${s.name}` },
    { type:'Quick Revision',   emoji:'🔄', desc: s => `Flashcard review, formula sheet recall, and summary notes for ${s.name}` },
    { type:'Mock Practice',    emoji:'📝', desc: s => `Timed past-paper drill and MCQ practice for ${s.name}` },
  ];

  /* ── Subject urgency score ──────────────────────────────────── */
  function calculateSubjectScore(subj) {
    let score = 0;
    const pw = { Critical:40, High:25, Normal:10 };
    score += pw[subj.priority] || 10;
    if (subj.examDate) {
      const d = Math.max(1, Math.ceil((new Date(subj.examDate) - new Date()) / 86400000));
      if (d <= 3) score += 50;
      else if (d <= 7) score += 35;
      else if (d <= 14) score += 20;
      else score += 10;
    }
    if (subj.attendance && subj.attendance < 75) score += (75 - subj.attendance) * 2;
    const dw = { Hard:20, Medium:12, Easy:5 };
    score += dw[subj.difficulty] || 10;
    score += (subj.remainingSyllabus || 30) * 0.3;
    return Math.round(score);
  }

  /**
   * generateSchedule — Realistic, balanced weekly schedule builder
   *
   * Rules:
   *  1. Max 3 study sessions per day (not hectic)
   *  2. Use at most 60% of available free slots per day
   *  3. Every subject must appear at least once per week
   *  4. Rotate session types for variety
   *  5. Assign unique subject colors (consistent across views)
   */
  function generateSchedule(subjects, freeSlots, selectedDays, userPrefs = {}) {
    if (!subjects || subjects.length === 0) return {};
    if (!selectedDays || selectedDays.length === 0) selectedDays = ['Mon','Tue','Wed','Thu','Fri'];

    const noTimetable = !freeSlots || freeSlots.length === 0;

    /* Rank subjects by urgency, assign colors */
    const rankedSubjects = subjects.map((s, i) => ({
      ...s,
      score:      calculateSubjectScore(s),
      colorIndex: i,
      color:      PALETTE[i % PALETTE.length]
    })).sort((a, b) => b.score - a.score);

    const totalSubjects = rankedSubjects.length;
    const scheduleByDay = {};

    /* 
     * Fair subject rotation queue
     * Ensure each subject appears roughly equally across the week
     */
    let globalSlotIndex = 0;

    selectedDays.forEach((day) => {
      /* Get free slots for this day */
      let dayFreeSlots = noTimetable
        ? defaultWindows(day)
        : freeSlots.filter(s => s.day === day);

      /* If timetable exists but day is fully occupied, skip */
      if (!noTimetable && dayFreeSlots.length === 0) {
        scheduleByDay[day] = [];
        return;
      }

      /*
       * Realistic load limit:
       *  - Don't use all free slots (student needs personal time)
       *  - Cap at 3 sessions/day regardless
       *  - Use at most 60% of slots (minimum 1)
       */
      const rawLimit = Math.ceil(dayFreeSlots.length * 0.60);
      const maxSessions = Math.min(3, Math.max(1, rawLimit));
      const chosenSlots = dayFreeSlots.slice(0, maxSessions);

      scheduleByDay[day] = chosenSlots.map((slot, slotIdx) => {
        const subj  = rankedSubjects[globalSlotIndex % totalSubjects];
        const stype = SESSION_TYPES[(globalSlotIndex + slotIdx) % SESSION_TYPES.length];
        globalSlotIndex++;

        /* Duration string for display */
        const durMins = toMinutes(slot.end) - toMinutes(slot.start);
        const durLabel = durMins >= 90 ? '90 min' : durMins >= 60 ? '60 min' : `${durMins} min`;

        return {
          id:          `blk-${day}-${globalSlotIndex}`,
          time:        `${slot.start} – ${slot.end}`,
          start:       slot.start,
          end:         slot.end,
          duration:    durLabel,
          subject:     subj.name,
          subjectId:   subj.id,
          priority:    subj.priority  || 'Normal',
          attendance:  subj.attendance || 100,
          sessionType: stype.type,
          sessionEmoji:stype.emoji,
          description: stype.desc(subj),
          color:       subj.color,
          colorIndex:  subj.colorIndex,
          done:        false,
          completed:   false
        };
      });
    });

    return {
      schedule:       scheduleByDay,
      rankedSubjects: rankedSubjects,
      palette:        PALETTE,
      generatedAt:    new Date().toISOString()
    };
  }

  /* Default study windows when no timetable uploaded */
  function defaultWindows(day) {
    return [
      { day, start:'09:00', end:'10:30' },
      { day, start:'11:00', end:'12:30' },
      { day, start:'14:30', end:'16:00' },
    ];
  }

  function toMinutes(t) {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  /* ── AI Recommendation Engine ───────────────────────────────── */
  function getRecommendations(subjects, attendance, notes, user) {
    const recs = [];
    const lowAtt = subjects.filter(s => s.attendance < 75);
    if (lowAtt.length > 0) {
      lowAtt.forEach(s => {
        recs.push({ id:'rec-att-'+s.id, title:`⚠️ Attendance Warning: ${s.name}`, message:`${s.name} is at ${s.attendance}%. Attend next lectures to cross 75% threshold.`, type:'danger' });
      });
    }
    const upcoming = subjects.filter(s => s.examDate).sort((a,b) => new Date(a.examDate)-new Date(b.examDate));
    if (upcoming.length > 0) {
      const top = upcoming[0];
      const days = Math.max(1, Math.ceil((new Date(top.examDate)-new Date())/86400000));
      recs.push({ id:'rec-exam', title:`🔥 Exam Sprint: ${top.name}`, message:`${top.name} is in ${days} days. Allocate extra focus blocks today!`, type:'warning' });
    }
    recs.push({ id:'rec-goal', title:'🎯 Daily Study Goal', message:'Complete 2-3 study sessions today to maintain weekly coverage.', type:'success' });
    return recs;
  }

  return { generateSchedule, calculateSubjectScore, getRecommendations, PALETTE };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AIStudyPlanner;
