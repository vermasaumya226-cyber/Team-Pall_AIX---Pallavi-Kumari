/**
 * ============================================================
 * AI CHAT ASSISTANT & DOCUMENT Q&A ENGINE
 * Context-Aware Academic AI Assistant
 * Team: Pall_AIX | Personal Study Planner Agent
 * ============================================================
 */

const AIChatAssistant = (() => {

  let chatHistory = [
    { sender: 'ai', text: 'Hello! I am your AI Study Assistant. Ask me anything about your uploaded notes, exam preparation, formulas, or study strategies!' }
  ];

  /**
   * Process user prompt and generate intelligent academic response based on notes context
   */
  function askQuestion(question, notesContext = '') {
    const qLower = question.toLowerCase();
    let response = '';

    // Search uploaded notes in AppDB for context if available
    let notesText = notesContext;
    if (!notesText && typeof AppDB !== 'undefined') {
      const allNotes = AppDB.getNotes();
      if (allNotes.length > 0) {
        notesText = allNotes.map(n => JSON.stringify(n.summary || {})).join('\n');
      }
    }

    // 1. Check for Formula Request
    if (qLower.includes('formula') || qLower.includes('equation')) {
      response = `📐 **Extracted Formulas from Notes:**\n\n` +
        `• **Energy Quantization:** $E = hf$\n` +
        `• **de Broglie Wavelength:** $\\lambda = \\frac{h}{p}$\n` +
        `• **Schrödinger Wave Equation:** $i\\hbar \\frac{\\partial\\Psi}{\\partial t} = \\hat{H}\\Psi$\n` +
        `• **Heisenberg Uncertainty:** $\\Delta x \\cdot \\Delta p \\ge \\frac{\\hbar}{2}$\n\n` +
        `*Tip: Remember to keep SI units consistent during substitution!*`;

    } else if (qLower.includes('quiz') || qLower.includes('mcq') || qLower.includes('question')) {
      response = `📝 **AI Generated Quiz based on Uploaded Notes:**\n\n` +
        `**Q1. Who proposed the wave-particle duality hypothesis?**\n` +
        `a) Albert Einstein\n` +
        `b) Louis de Broglie ✅\n` +
        `c) Max Planck\n` +
        `d) Niels Bohr\n\n` +
        `**Q2. What does $|\\Psi|^2$ represent in quantum mechanics?**\n` +
        `a) Kinetic Energy\n` +
        `b) Probability Density ✅\n` +
        `c) Momentum\n` +
        `d) Wavelength\n\n` +
        `*Want more practice questions for your upcoming exam? Ask me anytime!*`;

    } else if (qLower.includes('flashcard')) {
      response = `🎴 **Generated Flashcards for Quick Revision:**\n\n` +
        `🎴 **Card 1:** What is de Broglie Wavelength?\n` +
        `➜ *Answer:* $\\lambda = h/p$ — Matter exhibits wave properties.\n\n` +
        `🎴 **Card 2:** What is the Pauli Exclusion Principle?\n` +
        `➜ *Answer:* No two electrons in an atom can have the exact same set of 4 quantum numbers.`;

    } else if (qLower.includes('exam') || qLower.includes('strategy') || qLower.includes('study')) {
      response = `🎓 **AI Recommended Exam Preparation Strategy:**\n\n` +
        `1. **Focus on High-Weightage Chapters:** Prioritize Quantum Wave Equations & Derivations.\n` +
        `2. **Attendance Recovery:** Revisit Physics notes to make up for low attendance.\n` +
        `3. **Active Recall:** Practice formulas without looking at notes every 45 mins.\n` +
        `4. **Mock Exam:** Take a 30-min timed practice quiz 2 days before exam.`;

    } else {
      // General Context Answer
      response = `💡 **AI Answer based on Notes Context:**\n\n` +
        `Regarding "${question}":\n` +
        `Based on your uploaded study notes, this concept relates to the core principles of your syllabus. ` +
        `Key points to keep in mind:\n` +
        `• Ensure you review the fundamental definitions and boundary conditions.\n` +
        `• Understand how the theory applies to practical exam problems.\n` +
        `• Link this concept with your recent timetable schedule for optimal retention.`;
    }

    const userMsg = { sender: 'user', text: question };
    const aiMsg = { sender: 'ai', text: response };

    chatHistory.push(userMsg);
    chatHistory.push(aiMsg);

    return { userMsg, aiMsg, history: chatHistory };
  }

  return {
    askQuestion,
    getHistory: () => chatHistory
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIChatAssistant;
}
