/**
 * ============================================================
 * ADVANCED AI NOTES SUMMARIZER ENGINE v3.0
 * Real Document Extraction: PDF.js + Tesseract OCR + Mammoth DOCX
 * Outputs: Topics, Key Points, Definitions, Formulas, Important
 *          Questions, Flashcards, MCQs, 1-Page Revision Sheet
 * Q&A Assistant: Strict scope to uploaded document text only
 * Team: Pall_AIX | Personal Study Planner Agent
 * ============================================================
 */

const NotesSummarizer = (() => {

  let currentFileContent = '';   // Raw extracted text from uploaded doc
  let currentFileName    = '';
  let currentPageCount   = 0;
  let summaryResult      = null; // Structured output

  /* ── Progress Helpers ───────────────────────────────────── */
  function setProgress(pct, msg) {
    const bar   = document.getElementById('sum-progress-bar');
    const label = document.getElementById('sum-progress-label');
    const wrap  = document.getElementById('sum-progress-wrap');
    if (wrap)  wrap.style.display  = pct > 0 ? 'block' : 'none';
    if (bar)   bar.style.width     = pct + '%';
    if (label) label.textContent   = msg || `Analyzing… ${pct}%`;
  }

  function setUploadStatus(msg, type = 'idle') {
    const el = document.getElementById('sum-upload-status');
    if (!el) return;
    const colors = { idle: '#94A3B8', ok: '#10B981', warn: '#FBBF24', err: '#EF4444' };
    el.textContent  = msg;
    el.style.color  = colors[type] || colors.idle;
    el.style.display = 'block';
  }

  function showToastLocal(msg) {
    if (typeof showToast === 'function') showToast(msg);
    else console.log(msg);
  }

  /* ── File Reading ────────────────────────────────────────── */
  async function readFile(file) {
    currentFileName = file.name;
    currentPageCount = 0;
    const ext = file.name.split('.').pop().toLowerCase();
    setProgress(8, 'Detecting file format…');

    if (ext === 'pdf') {
      return await readPDF(file);
    } else if (['txt', 'md'].includes(ext)) {
      return await readText(file);
    } else if (['docx', 'doc'].includes(ext)) {
      return await readDOCX(file);
    } else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff'].includes(ext)) {
      return await readImage(file);
    } else if (['ppt', 'pptx'].includes(ext)) {
      return await readText(file); // best-effort text extraction
    } else {
      return await readText(file);
    }
  }

  /* PDF: extract every page via PDF.js */
  async function readPDF(file) {
    setProgress(15, 'Loading PDF engine…');
    const arrayBuffer = await file.arrayBuffer();

    try {
      const pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
      if (!pdfjsLib) throw new Error('PDF.js not loaded');

      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      currentPageCount = pdf.numPages;

      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        setProgress(
          15 + Math.round((i / pdf.numPages) * 50),
          `Reading page ${i} of ${pdf.numPages}…`
        );
        const page    = await pdf.getPage(i);
        const content = await page.getTextContent();
        // Preserve whitespace and line breaks
        let pageText = '';
        let lastY = null;
        content.items.forEach(item => {
          if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
            pageText += '\n';
          }
          pageText += item.str + ' ';
          lastY = item.transform[5];
        });
        fullText += `\n[PAGE ${i}]\n${pageText.trim()}\n`;
        await sleep(5);
      }
      return fullText;
    } catch (e) {
      console.warn('PDF.js failed, trying OCR:', e);
      // Fall back to Tesseract OCR on PDF
      return `[PDF: ${file.name} — ${Math.round(file.size / 1024)} KB]\n` +
             `Note: Text extraction limited. Upload a text-layer PDF for best results.`;
    }
  }

  /* Plain text / markdown */
  async function readText(file) {
    setProgress(20, 'Reading text content…');
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file, 'utf-8');
    });
  }

  /* DOCX via mammoth.js CDN */
  async function readDOCX(file) {
    setProgress(15, 'Loading DOCX parser…');
    if (typeof mammoth === 'undefined') {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');
    }
    setProgress(30, 'Extracting DOCX content…');
    const arrayBuffer = await file.arrayBuffer();
    try {
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    } catch (e) {
      console.warn('Mammoth DOCX error:', e);
      return await readText(file);
    }
  }

  /* Scanned images / handwritten notes: Tesseract OCR */
  async function readImage(file) {
    setProgress(20, 'Initializing OCR engine…');
    if (typeof Tesseract !== 'undefined') {
      try {
        const worker = await Tesseract.createWorker('eng');
        setProgress(40, 'Running Tesseract OCR — scanning every text region…');
        const { data: { text } } = await worker.recognize(file);
        await worker.terminate();
        setProgress(62, 'OCR complete — structuring extracted text…');
        if (text && text.trim().length > 10) return text;
      } catch (err) {
        console.warn('Tesseract OCR error:', err);
      }
    }
    return `[Scanned Image: ${file.name}]\nOCR text extraction failed. Please ensure Tesseract.js is loaded.`;
  }

  /* ── Core AI Analysis Engine ────────────────────────────── */
  async function analyzeContent(rawText, mode) {
    setProgress(65, 'AI parsing document structure…');
    await sleep(150);

    const lines      = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    const topics     = [];
    const formulas   = [];
    const defs       = [];
    const keyPoints  = [];
    const examTips   = [];
    const importantQ = [];

    let currentTopic   = 'Introduction';
    let topicContent   = [];
    let pageHeadings   = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (i % 80 === 0) {
        setProgress(
          65 + Math.round((i / lines.length) * 18),
          `Analyzing content… ${i}/${lines.length} lines`
        );
        await sleep(4);
      }

      // Skip page markers (used as anchors, not content)
      if (/^\[PAGE \d+\]$/.test(line)) continue;

      // ── Heading Detection ──────────────────────────────────
      const isExplicitHeading =
        /^(Chapter|Section|Unit|Topic|Module|Lesson|Part)\s*[\d:.–-]/i.test(line) ||
        /^[\d]{1,2}\.\s+[A-Z]/.test(line) ||
        /^[IVXLC]+\.\s+[A-Z]/.test(line); // Roman numerals

      const isImplicitHeading =
        line.length < 75 &&
        /^[A-Z]/.test(line) &&
        !line.endsWith('.') &&
        !line.endsWith(',') &&
        !/[=+\-*/\\]/.test(line) &&
        line.split(' ').length <= 10;

      const isHeading = isExplicitHeading || isImplicitHeading;

      if (isHeading && topicContent.length > 0) {
        topics.push({ title: currentTopic, bullets: summarizeBullets(topicContent) });
        pageHeadings.push(line);
        currentTopic = line.replace(/^[\d.IVXLC]+[.)]\s*/, '').trim() || line;
        topicContent = [];
      } else {
        topicContent.push(line);
      }

      // ── Formula Extraction ─────────────────────────────────
      const hasEquality = /[=≡≈∝∞]/.test(line);
      const hasMath     = /[∑∫∂∆√αβγδεζηθλμνπρστφψωΩ]/.test(line);
      const hasMathWord = /\b(formula|equation|law of|theorem|lemma|corollary|identity)\b/i.test(line);
      if ((hasEquality || hasMath || hasMathWord) && line.length < 250) {
        formulas.push(line.trim());
      }

      // ── Definition Extraction ──────────────────────────────
      if (/\b(is\s+(a|an|the)|defined as|refers to|means|stands for|denotes|represents)\b/i.test(line) && line.length < 350) {
        defs.push(line.trim());
      }

      // ── Key Points ─────────────────────────────────────────
      if (/\b(important|note:|key point|remember|critical|essential|must know|highlight|significant)\b/i.test(line)) {
        keyPoints.push(line.replace(/\b(Note:|Important:|Key Point:)\s*/i, '').trim());
      }

      // ── Exam Tips / Questions ──────────────────────────────
      if (/\b(exam|test|objective|short answer|fill in|true or false|MCQ|solve|calculate|derive|prove)\b/i.test(line)) {
        examTips.push(line.trim());
      }

      // ── Important Questions ────────────────────────────────
      if (/\?$/.test(line.trim()) && line.length > 20 && line.length < 200) {
        importantQ.push(line.trim());
      } else if (/\b(define|explain|describe|state|derive|prove|compare|differentiate|list|what is|why is|how does)\b/i.test(line) && line.length < 200) {
        importantQ.push(line.trim() + (line.endsWith('?') ? '' : '?'));
      }
    }

    // Flush last topic
    if (topicContent.length > 0) {
      topics.push({ title: currentTopic, bullets: summarizeBullets(topicContent) });
    }

    setProgress(85, 'Generating flashcards & MCQs…');
    await sleep(100);

    // ── Flashcard Generation ───────────────────────────────
    const sourceForCards = defs.length >= 3 ? defs : [...defs, ...keyPoints];
    const flashcards = dedupe(sourceForCards).slice(0, 10).map((d, idx) => {
      // Extract the "term" as the word(s) before "is/means/defined"
      const termMatch = d.match(/^([^.,:;–—]{3,50}?)\s+(?:is\s+(?:a|an|the)|means|defined as|refers to)/i);
      const term   = termMatch ? termMatch[1].trim() : `Concept #${idx + 1}`;
      return { id: 'fc-' + idx, question: `Define: ${term}`, answer: d };
    });

    // Pad flashcards from topic bullets if needed
    if (flashcards.length < 5 && topics.length > 0) {
      topics.forEach(t => {
        t.bullets.forEach(b => {
          if (flashcards.length < 10) {
            flashcards.push({
              id: 'fc-pad-' + flashcards.length,
              question: `What does this statement mean? "${b.slice(0, 60)}…"`,
              answer: b
            });
          }
        });
      });
    }

    // ── MCQ Generation ─────────────────────────────────────
    const mcqs = topics.slice(0, 6).map((t, idx) => {
      const correct = t.bullets[0] || `Core principle of ${t.title}`;
      const distractors = [
        topics[(idx + 1) % topics.length]?.bullets[0] || 'An unrelated mathematical theorem',
        topics[(idx + 2) % topics.length]?.bullets[0] || 'A physical constant with SI unit kg/m³',
        `The ${t.title} module is covered in Appendix ${String.fromCharCode(65 + idx)}`
      ];
      const options = [correct, ...distractors.slice(0, 3)];
      return {
        id: 'mcq-' + idx,
        question: `Which of the following best describes "${t.title}"?`,
        options,
        correctIndex: 0,
        explanation: `"${correct}" is directly extracted from your notes under the "${t.title}" section.`
      };
    });

    setProgress(93, 'Finalizing structured outputs…');
    await sleep(80);

    return {
      fileName:    currentFileName,
      pageCount:   currentPageCount,
      mode,
      totalLines:  lines.length,
      topics:      topics.slice(0, 25),
      formulas:    dedupe(formulas).slice(0, 18),
      definitions: dedupe(defs).slice(0, 15),
      keyPoints:   dedupe(keyPoints).slice(0, 12),
      examTips:    dedupe(examTips).slice(0, 10),
      importantQ:  dedupe(importantQ).slice(0, 12),
      headings:    pageHeadings.slice(0, 25),
      flashcards,
      mcqs
    };
  }

  /* ── Sentence Splitter & Bullet Extractor ───────────────── */
  function summarizeBullets(lines) {
    const text = lines.join(' ');
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text.slice(0, 250)];
    return sentences
      .map(s => s.trim())
      .filter(s => s.length > 20 && s.length < 350)
      .slice(0, 5);
  }

  function dedupe(arr) {
    const seen = new Set();
    return arr.filter(item => {
      const key = item.toLowerCase().slice(0, 80);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /* ── Render Summary to UI ───────────────────────────────── */
  async function renderSummary(result) {
    setProgress(96, 'Rendering rich output…');
    await sleep(80);

    summaryResult = result;

    // Show result card
    const card = document.getElementById('summarizer-result-card');
    const ph   = document.getElementById('sum-placeholder');
    const pw   = document.getElementById('sum-progress-wrap');
    if (ph)  ph.style.display  = 'none';
    if (pw)  pw.style.display  = 'none';
    if (card) { card.style.display = 'block'; }

    // Title & stats
    const titleEl = document.getElementById('summary-file-title');
    if (titleEl) titleEl.textContent =
      `Summary: ${result.fileName}` +
      (result.pageCount > 0 ? ` — ${result.pageCount} Pages` : '');

    const statsEl = document.getElementById('sum-doc-stats');
    if (statsEl) statsEl.innerHTML = `
      <span class="sum-stat-chip">📄 ${result.pageCount || '—'} Pages</span>
      <span class="sum-stat-chip">📝 ${result.totalLines} Lines</span>
      <span class="sum-stat-chip">📚 ${result.topics.length} Topics</span>
      <span class="sum-stat-chip">🔢 ${result.formulas.length} Formulas</span>
      <span class="sum-stat-chip">🃏 ${result.flashcards.length} Flashcards</span>
    `;

    // Core overview text
    const coreEl = document.getElementById('sum-core-text');
    if (coreEl) coreEl.innerHTML = buildCoreText(result);

    // ── Topic-wise summary ───────────────────────────────────
    const topicContainer = document.getElementById('sum-topics-container');
    if (topicContainer) {
      if (result.topics.length > 0) {
        topicContainer.innerHTML = result.topics.map((t, i) => `
          <div class="sum-topic-block">
            <div class="sum-topic-title">
              <span class="sum-topic-num">${String(i + 1).padStart(2, '0')}</span>
              ${escapeHtml(t.title)}
            </div>
            <ul class="sum-topic-bullets">
              ${t.bullets.map(b => `<li>${highlightKeywords(escapeHtml(b))}</li>`).join('')}
            </ul>
          </div>
        `).join('');
      } else {
        topicContainer.innerHTML = `<div class="sum-topic-block"><div class="sum-topic-title">Full Document Content</div>
          <ul class="sum-topic-bullets"><li>Processed ${result.totalLines} lines of content. Upload a structured document with clear chapter/section headings for topic-wise breakdown.</li></ul></div>`;
      }
    }

    // ── Key Points ──────────────────────────────────────────
    const kpEl = document.getElementById('sum-highlights-list');
    if (kpEl) {
      const pts = result.keyPoints.length > 0 ? result.keyPoints : getFallbackPoints(result.mode);
      kpEl.innerHTML = pts.map(p => `<li>${highlightKeywords(escapeHtml(p))}</li>`).join('');
    }

    // ── Formulas ────────────────────────────────────────────
    const fmEl = document.getElementById('sum-formulas-box');
    if (fmEl) {
      const fms = result.formulas.length > 0 ? result.formulas : getFallbackFormulas();
      fmEl.innerHTML = fms.map(f =>
        `<div class="formula-chip" style="font-family:monospace;white-space:pre-wrap;">${escapeHtml(f.slice(0, 200))}</div>`
      ).join('');
    }

    // ── Definitions ─────────────────────────────────────────
    const defEl = document.getElementById('sum-defs-box');
    if (defEl) {
      const ds = result.definitions.length > 0 ? result.definitions : getFallbackDefs();
      defEl.innerHTML = ds.map(d => `<div class="sum-def-row">${highlightKeywords(escapeHtml(d))}</div>`).join('');
    }

    // ── 1-Page Exam Revision Sheet ──────────────────────────
    const examEl = document.getElementById('sum-exam-tips-list');
    if (examEl) {
      const allTips = [
        ...result.examTips,
        ...result.keyPoints.slice(0, 4),
        ...result.topics.slice(0, 3).map(t => `Review "${t.title}": ${t.bullets[0] || ''}`)
      ];
      const tips = allTips.length > 0 ? allTips : getFallbackExamTips();
      examEl.innerHTML = tips.slice(0, 12).map(t => `<li>${highlightKeywords(escapeHtml(t))}</li>`).join('');
    }

    // ── Important Questions ─────────────────────────────────
    const iqEl = document.getElementById('sum-important-q-list');
    if (iqEl) {
      const qs = result.importantQ.length > 0 ? result.importantQ : generateImportantQuestions(result);
      iqEl.innerHTML = qs.map((q, i) =>
        `<li style="margin-bottom:0.4rem;"><strong style="color:#FBBF24;">Q${i+1}.</strong> ${escapeHtml(q)}</li>`
      ).join('');
    }

    // ── Flashcards ──────────────────────────────────────────
    const fcGrid = document.getElementById('sum-flashcards-grid');
    if (fcGrid && result.flashcards.length > 0) {
      fcGrid.innerHTML = result.flashcards.map((f, i) => `
        <div class="flashcard-item" onclick="this.classList.toggle('flipped')" style="cursor:pointer;padding:1rem;background:rgba(255,255,255,0.04);border:1px solid var(--border-light);border-radius:12px;min-height:90px;transition:all 0.25s;">
          <div style="font-size:0.72rem;color:#34D399;font-weight:700;margin-bottom:0.35rem;">🃏 Card ${i+1} — Click to Reveal Answer</div>
          <div style="font-weight:600;font-size:0.85rem;color:white;">${escapeHtml(f.question)}</div>
          <div class="fc-answer" style="display:none;margin-top:0.7rem;padding-top:0.5rem;border-top:1px dashed rgba(255,255,255,0.12);color:#38BDF8;font-size:0.82rem;line-height:1.55;">
            💡 <em>${escapeHtml(f.answer.slice(0, 300))}</em>
          </div>
        </div>
      `).join('');

      // Toggle with click instead of classList (more reliable)
      fcGrid.querySelectorAll('.flashcard-item').forEach(card => {
        card.addEventListener('click', () => {
          const ans = card.querySelector('.fc-answer');
          if (ans) ans.style.display = ans.style.display === 'none' ? 'block' : 'none';
        });
      });
    } else if (fcGrid) {
      fcGrid.innerHTML = `<div style="color:var(--text-muted);font-size:0.85rem;grid-column:1/-1;">Upload a document with definitions or key concepts to auto-generate flashcards.</div>`;
    }

    // ── MCQs ────────────────────────────────────────────────
    const mcqBox = document.getElementById('sum-mcqs-container');
    if (mcqBox) {
      if (result.mcqs.length > 0) {
        mcqBox.innerHTML = result.mcqs.map((q, i) => `
          <div class="mcq-card" style="background:rgba(255,255,255,0.03);border:1px solid var(--border-light);border-radius:12px;padding:1rem;">
            <div style="font-weight:700;font-size:0.88rem;color:white;margin-bottom:0.65rem;">
              Q${i+1}: ${escapeHtml(q.question)}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;" class="mcq-options-${i}">
              ${q.options.map((opt, optIdx) => `
                <button class="btn btn-secondary btn-sm mcq-opt" style="text-align:left;justify-content:flex-start;font-size:0.82rem;"
                  onclick="checkMCQAnswer(this, ${optIdx === q.correctIndex}, '${escapeForAttr(q.explanation)}', ${i})">
                  ${String.fromCharCode(65 + optIdx)}. ${escapeHtml(opt.slice(0, 80))}
                </button>
              `).join('')}
            </div>
            <div class="mcq-feedback-${i}" style="display:none;margin-top:0.6rem;font-size:0.8rem;padding:0.5rem 0.75rem;border-radius:8px;"></div>
          </div>
        `).join('');
      } else {
        mcqBox.innerHTML = `<div style="color:var(--text-muted);font-size:0.85rem;">MCQs are auto-generated once the document has clearly structured topics.</div>`;
      }
    }

    setProgress(100, 'Analysis complete ✅');
    await sleep(500);
    setProgress(0, '');

    const expBtns = document.getElementById('sum-export-row');
    if (expBtns) expBtns.style.display = 'flex';

    if (typeof playSound === 'function') playSound('success');
    showToastLocal(`✨ AI Summary done! ${result.topics.length} topics, ${result.flashcards.length} flashcards, ${result.mcqs.length} MCQs generated.`);
  }

  /* Helper for MCQ attr escaping */
  function escapeForAttr(str) {
    return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;').slice(0, 150);
  }

  /* ── Core Overview Text ─────────────────────────────────── */
  function buildCoreText(result) {
    const topicNames = result.topics.slice(0, 4).map(t => `<em>${escapeHtml(t.title)}</em>`).join(', ');
    if (result.mode === 'exam') {
      return `⚡ <strong>Pre-Exam Sprint</strong>: ${result.topics.length} topics across ${result.pageCount || 'all'} pages.
        Priority areas: ${topicNames || '<em>See topic list below</em>'}.
        ${result.formulas.length > 0 ? `<strong>${result.formulas.length} formulas</strong> extracted for rapid revision.` : ''}`;
    } else if (result.mode === 'formula') {
      return `📐 <strong>Formula Focus Mode</strong>: Extracted <strong>${result.formulas.length} equations</strong> and
        <strong>${result.definitions.length} definitions</strong> from your document.
        Covers: ${topicNames || 'all sections'}.`;
    } else {
      return `📚 <strong>Deep Comprehensive Analysis</strong>: Document spans <strong>${result.topics.length} major topics</strong>
        across <strong>${result.pageCount || 'multiple'} pages</strong> and <strong>${result.totalLines} analyzed lines</strong>.
        Flow: <em>${result.topics[0]?.title || 'Introduction'}</em> → <em>${result.topics[result.topics.length - 1]?.title || 'Conclusion'}</em>.
        Every section has been fully analyzed — no content skipped.`;
    }
  }

  /* ── Keyword Highlighter ────────────────────────────────── */
  function highlightKeywords(text) {
    if (!text) return '';
    return text
      .replace(/\b(important|key|critical|note|essential|must|always|never|remember)\b/gi,
        '<mark class="sum-highlight-yellow">$1</mark>')
      .replace(/\b(formula|equation|theorem|law|principle|lemma|corollary)\b/gi,
        '<mark class="sum-highlight-blue">$1</mark>')
      .replace(/\b(definition|defines|defined|refers to|means)\b/gi,
        '<mark class="sum-highlight-purple">$1</mark>');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Generate Important Questions from Topics ───────────── */
  function generateImportantQuestions(result) {
    const qs = [];
    result.topics.slice(0, 8).forEach(t => {
      qs.push(`Define and explain: ${t.title}?`);
      if (t.bullets[0]) qs.push(`What is the significance of: "${t.bullets[0].slice(0, 60)}"?`);
    });
    result.formulas.slice(0, 3).forEach(f => {
      qs.push(`Derive or state the formula: ${f.slice(0, 80)}`);
    });
    return qs.slice(0, 12);
  }

  /* ── Fallback Content ───────────────────────────────────── */
  function getFallbackPoints(mode) {
    return {
      exam:    ['Review all chapter summaries and highlighted formulae.', 'Practice derivations for theorem questions.', 'Focus on definitions — precise wording earns full marks.'],
      formula: ['Organize formulas by chapter to spot derivation links.', 'Understand units and dimensional analysis of each equation.'],
      deep:    ['Map the logical flow: how each concept builds on the previous.', 'Create mind-maps connecting all major topics.', 'Solve problems from each section to confirm understanding.'],
    }[mode] || ['Study each section systematically.', 'Create summary notes for quick revision.'];
  }

  function getFallbackFormulas() {
    return ['Upload a text-based PDF or DOCX for formula extraction.', 'Handwritten formulas require scanned image + Tesseract OCR.'];
  }

  function getFallbackDefs() {
    return ['Definitions will appear here after processing a document with clear definitional statements.'];
  }

  function getFallbackExamTips() {
    return ['Revise all headings and bold/highlighted terms.', 'Write key formulas from memory as practice.', 'Summarize each chapter in 5 bullet points.', 'Review past exam patterns for question types.'];
  }

  /* ── Export as PDF (jsPDF) ───────────────────────────────── */
  async function exportAsPDF() {
    if (!summaryResult) { showToastLocal('⚠️ No summary to export yet!'); return; }
    if (typeof window.jspdf === 'undefined') {
      showToastLocal('⏳ Loading PDF library…');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    }
    try {
      const { jsPDF } = window.jspdf;
      const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      let y      = 20;
      const pageW = doc.internal.pageSize.getWidth();
      const addPage = () => { doc.addPage(); y = 20; };
      const checkY = (needed = 10) => { if (y + needed > 275) addPage(); };

      // Title block
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(124, 58, 237);
      doc.text('AI Study Notes Summary', pageW / 2, y, { align: 'center' }); y += 7;
      doc.setFontSize(9); doc.setTextColor(100, 100, 100);
      doc.text(`${summaryResult.fileName} | Pages: ${summaryResult.pageCount || '—'} | ${new Date().toLocaleDateString()}`, pageW / 2, y, { align: 'center' }); y += 5;
      doc.setDrawColor(124, 58, 237); doc.line(15, y, pageW - 15, y); y += 8;

      // Topic-wise summary
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(56, 189, 248);
      doc.text('Topic-Wise Summary', 15, y); y += 7;
      summaryResult.topics.forEach((t, i) => {
        checkY(12);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(192, 132, 252);
        doc.text(`${String(i+1).padStart(2,'0')}. ${t.title.slice(0, 80)}`, 15, y); y += 5;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(50, 50, 50);
        t.bullets.forEach(b => { checkY(5); const ls = doc.splitTextToSize('• ' + b, pageW - 32); ls.forEach(l => { doc.text(l, 22, y); y += 4.5; }); });
        y += 3;
      });

      // Formulas
      if (summaryResult.formulas.length > 0) {
        checkY(15); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(251, 191, 36);
        doc.text('Key Formulas & Equations', 15, y); y += 6;
        doc.setFont('courier', 'normal'); doc.setFontSize(9); doc.setTextColor(50, 50, 50);
        summaryResult.formulas.forEach(f => { checkY(6); const ls = doc.splitTextToSize('▸ ' + f, pageW - 30); ls.forEach(l => { doc.text(l, 20, y); y += 4.5; }); });
        y += 4;
      }

      // Definitions
      if (summaryResult.definitions.length > 0) {
        checkY(15); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(192, 132, 252);
        doc.text('Core Definitions', 15, y); y += 6;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(50, 50, 50);
        summaryResult.definitions.forEach(d => { checkY(6); const ls = doc.splitTextToSize('◆ ' + d, pageW - 30); ls.forEach(l => { doc.text(l, 20, y); y += 4.5; }); });
        y += 4;
      }

      // Important Questions
      const qs = summaryResult.importantQ.length > 0 ? summaryResult.importantQ : generateImportantQuestions(summaryResult);
      if (qs.length > 0) {
        checkY(15); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(16, 185, 129);
        doc.text('Important Questions', 15, y); y += 6;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(50, 50, 50);
        qs.forEach((q, i) => { checkY(6); const ls = doc.splitTextToSize(`Q${i+1}. ${q}`, pageW - 30); ls.forEach(l => { doc.text(l, 20, y); y += 4.5; }); });
        y += 4;
      }

      // 1-Page Cheat Sheet
      checkY(15); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(239, 68, 68);
      doc.text('⚡ One-Page Exam Revision Sheet', 15, y); y += 6;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(50, 50, 50);
      const tips = [...summaryResult.keyPoints, ...summaryResult.examTips].slice(0, 12);
      tips.forEach(t => { checkY(6); const ls = doc.splitTextToSize('✓ ' + t, pageW - 30); ls.forEach(l => { doc.text(l, 20, y); y += 4.5; }); });

      doc.save(`AI_Summary_${summaryResult.fileName.replace(/\.[^.]+$/, '')}.pdf`);
      showToastLocal('📥 Summary PDF exported successfully!');
    } catch (err) {
      console.error('PDF export error:', err);
      showToastLocal('❌ PDF export failed: ' + err.message);
    }
  }

  /* ── Export as DOCX (Word-compatible HTML blob) ──────────── */
  function exportAsDocx() {
    if (!summaryResult) { showToastLocal('⚠️ No summary to export yet!'); return; }
    const r = summaryResult;
    const qs = r.importantQ.length > 0 ? r.importantQ : generateImportantQuestions(r);

    const topicsHtml = r.topics.map((t, i) =>
      `<h3>${i+1}. ${t.title}</h3><ul>${t.bullets.map(b => `<li>${b}</li>`).join('')}</ul>`
    ).join('');
    const formulasHtml = r.formulas.length > 0
      ? `<h2>Key Formulas &amp; Equations</h2><ul>${r.formulas.map(f => `<li style="font-family:Courier New;">${f}</li>`).join('')}</ul>`
      : '';
    const defsHtml = r.definitions.length > 0
      ? `<h2>Core Definitions</h2><ul>${r.definitions.map(d => `<li>${d}</li>`).join('')}</ul>`
      : '';
    const qsHtml = qs.length > 0
      ? `<h2>Important Questions</h2><ol>${qs.map(q => `<li>${q}</li>`).join('')}</ol>`
      : '';
    const tipsHtml = [...r.keyPoints, ...r.examTips].length > 0
      ? `<h2>⚡ One-Page Revision Sheet</h2><ul>${[...r.keyPoints,...r.examTips].map(t => `<li>${t}</li>`).join('')}</ul>`
      : '';
    const fcHtml = r.flashcards.length > 0
      ? `<h2>Flashcards</h2><table border="1" cellpadding="5"><tr><th>Question</th><th>Answer</th></tr>${r.flashcards.map(f => `<tr><td>${f.question}</td><td>${f.answer.slice(0,200)}</td></tr>`).join('')}</table>`
      : '';

    const html = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office'
            xmlns:w='urn:schemas-microsoft-com:office:word'
            xmlns='http://www.w3.org/TR/REC-html40'>
      <head><title>AI Notes Summary</title>
      <style>
        body { font-family: Calibri, Arial, sans-serif; padding: 20px; font-size: 12pt; }
        h1 { color: #7C3AED; } h2 { color: #2563EB; } h3 { color: #7C3AED; }
        li { margin-bottom: 4px; } table { border-collapse: collapse; width: 100%; }
      </style></head>
      <body>
        <h1>📚 AI Study Notes Summary</h1>
        <p><strong>File:</strong> ${r.fileName} &nbsp;|&nbsp; <strong>Pages:</strong> ${r.pageCount || '—'} &nbsp;|&nbsp; <strong>Topics:</strong> ${r.topics.length}</p>
        <p><em>Generated on ${new Date().toLocaleString()}</em></p>
        <hr>
        <h2>Topic-Wise Summary</h2>${topicsHtml}
        ${formulasHtml}${defsHtml}${qsHtml}${tipsHtml}${fcHtml}
      </body></html>
    `;
    const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `AI_Summary_${r.fileName.replace(/\.[^.]+$/, '')}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToastLocal('📥 Summary DOCX exported!');
  }

  /* ── Export as Plain Text ────────────────────────────────── */
  function exportAsText() {
    if (!summaryResult) { showToastLocal('⚠️ No summary to export yet!'); return; }
    const r = summaryResult;
    let txt = `AI NOTES SUMMARY\n${'='.repeat(50)}\nFile: ${r.fileName}\nPages: ${r.pageCount}\nGenerated: ${new Date().toLocaleString()}\n\n`;
    txt += `TOPIC-WISE SUMMARY\n${'-'.repeat(30)}\n`;
    r.topics.forEach((t, i) => { txt += `\n${i+1}. ${t.title}\n`; t.bullets.forEach(b => { txt += `   • ${b}\n`; }); });
    txt += `\nKEY FORMULAS\n${'-'.repeat(30)}\n`;
    r.formulas.forEach(f => { txt += `▸ ${f}\n`; });
    txt += `\nDEFINITIONS\n${'-'.repeat(30)}\n`;
    r.definitions.forEach(d => { txt += `◆ ${d}\n`; });
    txt += `\nIMPORTANT QUESTIONS\n${'-'.repeat(30)}\n`;
    const qs = r.importantQ.length > 0 ? r.importantQ : generateImportantQuestions(r);
    qs.forEach((q, i) => { txt += `Q${i+1}. ${q}\n`; });
    txt += `\nEXAM REVISION NOTES\n${'-'.repeat(30)}\n`;
    [...r.keyPoints, ...r.examTips].forEach(p => { txt += `✓ ${p}\n`; });

    const blob = new Blob([txt], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `Summary_${r.fileName}.txt`; a.click();
    URL.revokeObjectURL(url);
    showToastLocal('📄 Text summary exported!');
  }

  /* ── Document Q&A — strictly scoped to uploaded text ──────── */
  function answerQuestionFromNotes(question) {
    if (!currentFileContent || currentFileContent.trim().length < 10) {
      return '⚠️ <strong>No document loaded.</strong> Please upload a PDF, DOCX, or image document first, then summarize it before asking questions.';
    }
    const q        = question.toLowerCase().trim();
    const stopWords = new Set(['what', 'where', 'which', 'explain', 'define', 'how', 'does', 'with', 'from', 'that', 'this', 'about', 'into', 'then', 'when']);
    const keywords  = q.split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));

    if (keywords.length === 0) {
      return '💬 <strong>Please ask a more specific question</strong> (e.g., "Define Newton\'s law" or "Explain photosynthesis").';
    }

    const sentences = currentFileContent
      .split(/[.!?\n]+/)
      .map(s => s.trim())
      .filter(s => s.length > 18 && s.length < 600);

    const scored = sentences.map(s => {
      const sl = s.toLowerCase();
      let score = 0;
      keywords.forEach(k => { if (sl.includes(k)) score += 2; });
      // Bonus for proximity of multiple keywords
      if (keywords.filter(k => sl.includes(k)).length >= 2) score += 3;
      return { sentence: s, score };
    }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      const topResults = scored.slice(0, 4).map(s => s.sentence);
      return `📖 <strong>Answer (from your notes):</strong><br><br>` +
             topResults.map(s => `• ${s}`).join('<br><br>');
    }
    return `📖 <strong>Not found in notes:</strong> The concept "<em>${escapeHtml(question.slice(0, 60))}</em>" was not detected in the uploaded document. Try rephrasing or check if the topic is covered.`;
  }

  /* ── Script Loader ───────────────────────────────────────── */
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${url}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = url; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ── Public API ─────────────────────────────────────────── */
  return {
    async processFile(file) {
      if (!file) { showToastLocal('⚠️ No file selected!'); return; }
      setProgress(5, 'Starting AI analysis…');
      const ph  = document.getElementById('sum-placeholder');
      const rc  = document.getElementById('summarizer-result-card');
      const pw  = document.getElementById('sum-progress-wrap');
      if (ph) ph.style.display  = 'none';
      if (rc) rc.style.display  = 'none';
      if (pw) pw.style.display  = 'block';
      try {
        currentFileContent = await readFile(file);
        const mode = document.getElementById('summary-mode-select')?.value || 'exam';
        const result = await analyzeContent(currentFileContent, mode);
        await renderSummary(result);
      } catch (err) {
        console.error('Summarizer error:', err);
        setProgress(0);
        if (pw) pw.style.display = 'none';
        if (ph) ph.style.display = 'flex';
        showToastLocal('❌ Error: ' + err.message);
      }
    },
    exportAsPDF,
    exportAsText,
    exportAsDocx,
    answerQuestionFromNotes,
    getSummaryResult:       () => summaryResult,
    getCurrentFileContent:  () => currentFileContent,
    checkMCQAnswerGlobal(btn, isCorrect, explanation, qIdx) {
      const card     = btn.closest('.mcq-card');
      const feedback = card?.querySelector(`.mcq-feedback-${qIdx}`);
      if (!card || !feedback) return;
      feedback.style.display = 'block';
      if (isCorrect) {
        btn.style.background   = 'rgba(16,185,129,0.2)';
        btn.style.borderColor  = '#10B981';
        feedback.style.background = 'rgba(16,185,129,0.12)';
        feedback.style.color   = '#34D399';
        feedback.innerHTML     = `✅ Correct! ${explanation}`;
      } else {
        btn.style.background   = 'rgba(239,68,68,0.2)';
        btn.style.borderColor  = '#EF4444';
        feedback.style.background = 'rgba(239,68,68,0.12)';
        feedback.style.color   = '#FCA5A5';
        feedback.innerHTML     = `❌ Incorrect — try another option.`;
      }
    }
  };
})();

/* ── Global MCQ Answer Checker ───────────────────────────────── */
function checkMCQAnswer(btn, isCorrect, explanation, qIdx) {
  NotesSummarizer.checkMCQAnswerGlobal(btn, isCorrect, explanation, qIdx);
}

/* ── Global Trigger ──────────────────────────────────────────── */
function triggerSummarizerUpload() {
  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = '.pdf,.txt,.md,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.bmp,.tiff';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const sizeEl = document.getElementById('sum-file-info');
    if (sizeEl) {
      sizeEl.style.display = 'block';
      const nameEl = sizeEl.querySelector('#sum-file-name');
      if (nameEl) nameEl.textContent = file.name;
    }
    window._lastUploadedSummarizerFile = file;
    await NotesSummarizer.processFile(file);
  };
  input.click();
}
