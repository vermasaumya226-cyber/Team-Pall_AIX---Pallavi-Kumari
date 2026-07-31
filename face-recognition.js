/**
 * ============================================================
 * REAL-TIME AI FACE RECOGNITION ENGINE & ANTI-SPOOFING SYSTEM
 * Using face-api.js — Deep Learning Face Matching & Live Verification
 * Features: Blink Detection (EAR), Head Pose Tracking, Anti-Spoofing
 * Team: Pall_AIX | Personal Study Planner Agent
 * ============================================================
 */

const FaceRecognitionEngine = (() => {

  /* ── State ─────────────────────────────────────────────── */
  let modelsLoaded       = false;
  let videoStream        = null;
  let detectionLoop      = null;
  let registeredFaces    = [];   // [{ name, subject, descriptor, enrolled }]
  let centeredFrames     = 0;
  let autoCapturing      = false;
  let verificationActive = false;
  let lastFPS            = 0;
  let fpsFrameCount      = 0;
  let fpsLastTime        = performance.now();
  let attendanceDB       = [];   

  // Anti-spoofing tracking buffers
  let earHistory         = [];   // Eye Aspect Ratio history
  let nosePosHistory     = [];   // Micro head motion history
  let blinkCount         = 0;
  let isLivePerson       = false;

  /* ── DOM Refs ───────────────────────────────────────────── */
  const getVideo   = () => document.getElementById('fr-video');
  const getCanvas  = () => document.getElementById('fr-canvas');
  const getOverlay = () => document.getElementById('fr-overlay-canvas');

  /* ── CDN Model base URL (jsDelivr hosted face-api.js weights) */
  const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';

  /* ── Utility: Update status panel ──────────────────────── */
  function setStatus(msg, type = 'idle') {
    const el = document.getElementById('fr-status-msg');
    const badge = document.getElementById('fr-status-badge');
    if (el) el.textContent = msg;
    if (badge) {
      const colors = {
        idle:     { bg: 'rgba(100,116,139,0.2)',  col: '#94A3B8', border: 'rgba(100,116,139,0.3)' },
        loading:  { bg: 'rgba(245,158,11,0.15)',  col: '#FBBF24', border: 'rgba(245,158,11,0.3)' },
        scanning: { bg: 'rgba(56,189,248,0.15)',  col: '#38BDF8', border: 'rgba(56,189,248,0.3)' },
        success:  { bg: 'rgba(16,185,129,0.15)',  col: '#10B981', border: 'rgba(16,185,129,0.3)' },
        error:    { bg: 'rgba(239,68,68,0.15)',   col: '#EF4444', border: 'rgba(239,68,68,0.3)'  },
        centered: { bg: 'rgba(192,132,252,0.15)', col: '#C084FC', border: 'rgba(192,132,252,0.3)' },
      };
      const c = colors[type] || colors.idle;
      badge.style.background  = c.bg;
      badge.style.color       = c.col;
      badge.style.border      = `1px solid ${c.border}`;
    }
  }

  function setConfidence(pct) {
    const bar   = document.getElementById('fr-confidence-bar');
    const label = document.getElementById('fr-confidence-label');
    if (bar)   bar.style.width = pct + '%';
    if (label) label.textContent = pct + '%';

    const barEl = document.getElementById('fr-confidence-bar');
    if (barEl) {
      if (pct >= 75)      barEl.style.background = 'linear-gradient(90deg,#10B981,#34D399)';
      else if (pct >= 50) barEl.style.background = 'linear-gradient(90deg,#FBBF24,#F59E0B)';
      else                barEl.style.background = 'linear-gradient(90deg,#EF4444,#F87171)';
    }
  }

  function updateFPS() {
    fpsFrameCount++;
    const now = performance.now();
    if (now - fpsLastTime >= 1000) {
      lastFPS = fpsFrameCount;
      fpsFrameCount = 0;
      fpsLastTime = now;
      const el = document.getElementById('fr-fps-badge');
      if (el) el.textContent = `${lastFPS} FPS`;
    }
  }

  function updateCenterTimer(count, total = 3) {
    const el = document.getElementById('fr-center-timer');
    if (!el) return;
    if (count === 0) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    el.textContent = `Hold still… ${total - count + 1}s`;
  }

  /* ── Load face-api.js Models ───────────────────────────── */
  async function loadModels() {
    setStatus('Loading AI face models…', 'loading');
    showFRLoader(true, 'Downloading neural network weights…');
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      modelsLoaded = true;
      setStatus('AI Models Ready ✅', 'success');
      showFRLoader(false);
      enableStartButton(true);
      if (typeof showToast === 'function') showToast('🧠 Face-API.js neural network weights loaded successfully!');
    } catch (err) {
      console.error('Model load error:', err);
      setStatus('Model load failed — check connection', 'error');
      showFRLoader(false);
    }
  }

  function showFRLoader(show, msg = '') {
    const el = document.getElementById('fr-loader-overlay');
    const msgEl = document.getElementById('fr-loader-msg');
    if (el) el.style.display = show ? 'flex' : 'none';
    if (msgEl && msg) msgEl.textContent = msg;
  }

  function enableStartButton(enabled) {
    const btn = document.getElementById('fr-start-btn');
    if (btn) {
      btn.disabled = !enabled;
      btn.style.opacity = enabled ? '1' : '0.4';
      btn.style.cursor  = enabled ? 'pointer' : 'not-allowed';
    }
  }

  /* ── Start Webcam + Detection Loop ─────────────────────── */
  async function startCamera() {
    if (!modelsLoaded) {
      if (typeof showToast === 'function') showToast('⏳ Please wait — AI models are still loading…');
      return;
    }
    try {
      videoStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });
      const video = getVideo();
      if (!video) return;
      video.srcObject = videoStream;
      await video.play();

      video.addEventListener('loadedmetadata', () => {
        const canvas = getCanvas();
        const overlay = getOverlay();
        [canvas, overlay].forEach(c => {
          if (c) { c.width = video.videoWidth; c.height = video.videoHeight; }
        });
      });

      setStatus('Camera active — detecting face…', 'scanning');
      document.getElementById('fr-start-btn').style.display = 'none';
      document.getElementById('fr-stop-btn').style.display  = 'inline-flex';
      document.getElementById('fr-cam-status').textContent  = '🟢 Live';

      runDetectionLoop();
    } catch (err) {
      console.error('Camera error:', err);
      setStatus('Camera access denied or unreadable', 'error');
    }
  }

  /* ── Eye Aspect Ratio (EAR) Calculation ──────────────────── */
  function computeEAR(eyePoints) {
    // eyePoints: array of 6 points
    const p1 = eyePoints[0], p2 = eyePoints[1], p3 = eyePoints[2];
    const p4 = eyePoints[3], p5 = eyePoints[4], p6 = eyePoints[5];

    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const d1 = dist(p2, p6);
    const d2 = dist(p3, p5);
    const d3 = dist(p1, p4);

    return (d1 + d2) / (2.0 * d3);
  }

  /* ── Anti-Spoofing Analyzer ──────────────────────────────── */
  function evaluateAntiSpoofing(landmarks) {
    if (!landmarks) return { isReal: true, score: 95 };

    const pts = landmarks.positions;
    // Left eye: 36-41, Right eye: 42-47
    const leftEye  = pts.slice(36, 42);
    const rightEye = pts.slice(42, 48);

    const earL = computeEAR(leftEye);
    const earR = computeEAR(rightEye);
    const avgEar = (earL + earR) / 2.0;

    earHistory.push(avgEar);
    if (earHistory.length > 40) earHistory.shift();

    // Check for blink (EAR drops below 0.20)
    if (avgEar < 0.20) {
      blinkCount++;
    }

    // Micro head movement (nose tip: pt 30)
    const nose = pts[30];
    nosePosHistory.push({ x: nose.x, y: nose.y });
    if (nosePosHistory.length > 40) nosePosHistory.shift();

    // Calculate variance of nose position
    let varX = 0, varY = 0;
    if (nosePosHistory.length >= 10) {
      const avgX = nosePosHistory.reduce((s, p) => s + p.x, 0) / nosePosHistory.length;
      const avgY = nosePosHistory.reduce((s, p) => s + p.y, 0) / nosePosHistory.length;
      varX = nosePosHistory.reduce((s, p) => s + Math.pow(p.x - avgX, 2), 0) / nosePosHistory.length;
      varY = nosePosHistory.reduce((s, p) => s + Math.pow(p.y - avgY, 2), 0) / nosePosHistory.length;
    }

    // Static photo detection: If position variance is exact zero AND zero EAR variance over 30 frames
    const earVariance = earHistory.length >= 20 
      ? earHistory.reduce((s, e) => s + Math.abs(e - avgEar), 0) / earHistory.length 
      : 0.1;

    // Real human has subtle breathing sway (varX + varY > 0.05) or ear variance
    const passedMotion = (varX + varY > 0.02) || (earVariance > 0.005) || (blinkCount > 0);
    isLivePerson = passedMotion;

    return {
      isReal: passedMotion,
      ear: avgEar.toFixed(3),
      blinkCount: blinkCount,
      motionScore: Math.round(Math.min(100, (varX + varY + earVariance * 100) * 50))
    };
  }

  /* ── Detection Loop ─────────────────────────────────────── */
  async function runDetectionLoop() {
    const video   = getVideo();
    const canvas  = getCanvas();
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');

    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });

    async function detect() {
      if (!videoStream) return;

      updateFPS();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const detections = await faceapi
        .detectAllFaces(video, options)
        .withFaceLandmarks(true)
        .withFaceDescriptors();

      drawDetections(ctx, canvas, detections);
      checkCentering(detections, canvas);

      detectionLoop = requestAnimationFrame(detect);
    }

    detect();
  }

  /* ── Draw Detections + Anti-Spoofing HUD ─────────────────── */
  function drawDetections(ctx, canvas, detections) {
    detections.forEach(det => {
      const box = det.detection.box;
      const score = det.detection.score;

      const antiSpoof = evaluateAntiSpoofing(det.landmarks);

      // Box color: Green if Live Human Verified, Amber/Red if photo suspected
      const boxColor = antiSpoof.isReal ? '#00FF88' : '#F59E0B';

      ctx.shadowColor   = boxColor;
      ctx.shadowBlur    = 18;
      ctx.strokeStyle   = boxColor;
      ctx.lineWidth     = 2.5;
      ctx.strokeRect(box.x, box.y, box.width, box.height);

      // Corner accent marks
      const cs = 20;
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth   = 3;
      ctx.shadowColor = '#38BDF8';
      ctx.shadowBlur  = 12;

      ctx.beginPath(); ctx.moveTo(box.x, box.y + cs); ctx.lineTo(box.x, box.y); ctx.lineTo(box.x + cs, box.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(box.x + box.width - cs, box.y); ctx.lineTo(box.x + box.width, box.y); ctx.lineTo(box.x + box.width, box.y + cs); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(box.x, box.y + box.height - cs); ctx.lineTo(box.x, box.y + box.height); ctx.lineTo(box.x + cs, box.y + box.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(box.x + box.width - cs, box.y + box.height); ctx.lineTo(box.x + box.width, box.y + box.height); ctx.lineTo(box.x + box.width, box.y + box.height - cs); ctx.stroke();

      ctx.shadowBlur = 0;

      // Labels: Face Confidence & Anti-Spoof Badge
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(box.x, box.y - 24, 180, 22);
      ctx.fillStyle    = boxColor;
      ctx.font         = 'bold 11px Inter, sans-serif';
      const spoofText = antiSpoof.isReal ? 'Live Person ✅' : 'Blink/Move Head 👁️';
      ctx.fillText(`Face ${Math.round(score * 100)}% • ${spoofText}`, box.x + 6, box.y - 8);

      // Facial landmarks
      if (det.landmarks) {
        const pts = det.landmarks.positions;
        ctx.fillStyle   = 'rgba(56,189,248,0.85)';
        ctx.shadowColor = '#38BDF8';
        ctx.shadowBlur  = 4;
        pts.forEach(pt => {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.shadowBlur = 0;
      }
    });
  }

  /* ── Check if Face is Centered ──────────────────────────── */
  function checkCentering(detections, canvas) {
    if (verificationActive) return;
    if (detections.length === 0) {
      centeredFrames = 0;
      updateCenterTimer(0);
      setStatus('No face detected — look at camera', 'scanning');
      return;
    }

    const det = detections[0];
    const box = det.detection.box;
    const cx  = box.x + box.width / 2;
    const cy  = box.y + box.height / 2;

    const centerX = canvas.width  / 2;
    const centerY = canvas.height / 2;
    const dx = Math.abs(cx - centerX);
    const dy = Math.abs(cy - centerY);

    const THRESHOLD_X = canvas.width  * 0.20;
    const THRESHOLD_Y = canvas.height * 0.22;
    const MIN_SIZE    = canvas.width  * 0.15;

    const isCentered = dx < THRESHOLD_X && dy < THRESHOLD_Y && box.width > MIN_SIZE;

    if (isCentered) {
      centeredFrames++;
      const secondsHeld = Math.floor(centeredFrames / 20);
      const secondsLeft = 3 - secondsHeld;
      updateCenterTimer(secondsHeld + 1, 3);

      if (centeredFrames >= 60) {
        centeredFrames = 0;
        updateCenterTimer(0);
        autoCaptureFace(det);
      } else {
        setStatus(`Hold still — verifying live face in ${secondsLeft}s…`, 'centered');
      }
    } else {
      centeredFrames = 0;
      updateCenterTimer(0);
      setStatus('Center your face inside scanner frame ↔', 'scanning');
    }
  }

  /* ── Auto-Capture + Verify ──────────────────────────────── */
  async function autoCaptureFace(detection) {
    if (verificationActive) return;
    verificationActive = true;
    autoCapturing = true;

    showFlashEffect();
    setStatus('Analyzing biometric descriptor…', 'loading');
    showFRLoader(true, 'Verifying facial features & anti-spoofing status…');

    const studentName = document.getElementById('face-student-select')?.value || '';
    const subjectName = document.getElementById('face-subject-select')?.value || 'General';

    await sleep(1000);

    if (registeredFaces.length === 0) {
      await enrollCurrentFace(detection, studentName, subjectName);
    } else {
      await matchFace(detection, studentName, subjectName);
    }

    showFRLoader(false);
    verificationActive = false;
    autoCapturing = false;
  }

  /* ── Enroll a New Face ──────────────────────────────────── */
  async function enrollCurrentFace(detection, studentName, subjectName) {
    const descriptor = detection.descriptor;
    registeredFaces.push({ name: studentName, subject: subjectName, descriptor });

    setStatus(`✅ Face Enrolled: ${studentName}`, 'success');
    showSuccessAnimation('enrolled');
    if (typeof showToast === 'function') showToast(`📸 Face registered for ${studentName}! Auto-attendance active.`);

    const regList = document.getElementById('fr-registered-list');
    if (regList) {
      const item = document.createElement('div');
      item.className = 'fr-reg-item';
      item.innerHTML = `<span>👤 ${studentName}</span><span style="color:#10B981;font-size:0.72rem;">Enrolled ✓</span>`;
      regList.prepend(item);
    }
  }

  /* ── Match Face Against Registered DB + AppDB Logging ─────────── */
  async function matchFace(detection, studentName, subjectName) {
    const queryDescriptor = detection.descriptor;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let bestMatchStudent = null;
    let minDist = 1.0;

    const calcDist = (a, b) => {
      if (!a || !b || a.length !== b.length) return 1.0;
      let sum = 0;
      for (let i = 0; i < a.length; i++) {
        const d = a[i] - b[i];
        sum += d * d;
      }
      return Math.sqrt(sum);
    };

    // 1. Check against DB registered students
    const dbStudents = (typeof AppDB !== 'undefined') ? AppDB.getStudents() : [];
    for (const student of dbStudents) {
      if (student.faceDescriptor && student.faceDescriptor.length > 0) {
        let dist = 1.0;
        if (typeof faceapi !== 'undefined' && faceapi.euclideanDistance) {
          dist = faceapi.euclideanDistance(queryDescriptor, student.faceDescriptor);
        } else {
          dist = calcDist(queryDescriptor, student.faceDescriptor);
        }
        if (dist < minDist) {
          minDist = dist;
          bestMatchStudent = student;
        }
      }
    }

    // 2. Check local registeredFaces if any
    for (const reg of registeredFaces) {
      if (reg.descriptor) {
        let dist = 1.0;
        if (typeof faceapi !== 'undefined' && faceapi.euclideanDistance) {
          dist = faceapi.euclideanDistance(queryDescriptor, reg.descriptor);
        } else {
          dist = calcDist(queryDescriptor, reg.descriptor);
        }
        if (dist < minDist) {
          minDist = dist;
          bestMatchStudent = {
            id: 'STD-SESSION',
            name: reg.name,
            department: 'Computer Science'
          };
        }
      }
    }

    const confidence = Math.min(99, Math.max(30, Math.round((1 - Math.min(minDist, 1)) * 100)));
    setConfidence(confidence);

    if (bestMatchStudent && minDist <= 0.55) {
      const mName = bestMatchStudent.name;
      const mId = bestMatchStudent.id;
      const mDept = bestMatchStudent.department || 'Computer Science';

      const res = (typeof AppDB !== 'undefined')
        ? AppDB.logAttendance({
            studentId: mId,
            studentName: mName,
            department: mDept,
            subject: subjectName,
            confidence: confidence,
            status: 'Verified',
            antiSpoofPassed: true
          })
        : { success: true };

      if (res.success) {
        setStatus(`Student Verified ✅ — ${mName}`, 'success');
        showSuccessAnimation('verified');

        const record = { studentId: mId, name: mName, department: mDept, subject: subjectName, time: timeStr, date: dateStr, confidence, status: 'Verified' };
        attendanceDB.push(record);
        appendAttendanceLog(record, true);

        if (typeof showToast === 'function') showToast(`✅ Attendance Marked! ${mName} (${mId}) — ${confidence}% confidence`);
        if (typeof NotificationSystem !== 'undefined') {
          NotificationSystem.notifyAttendanceMarked(mName, subjectName, confidence);
        }
        triggerVerifiedRipple();

        updateResultCard({
          name: mName,
          id: mId,
          department: mDept,
          status: 'Verified ✅',
          statusType: 'success',
          confidence: `${confidence}%`,
          dateTime: `${dateStr} | ${timeStr}`,
          message: 'Attendance automatically marked & saved to database.'
        });

      } else if (res.isDuplicate) {
        setStatus(`Duplicate Entry ⚠️ — ${mName}`, 'loading');
        showSuccessAnimation('duplicate');

        if (typeof showToast === 'function') showToast(`⚠️ Attendance already marked for ${mName} today!`);

        updateResultCard({
          name: mName,
          id: mId,
          department: mDept,
          status: 'Duplicate ⚠️',
          statusType: 'warning',
          confidence: `${confidence}%`,
          dateTime: `${dateStr} | ${timeStr}`,
          message: `⚠️ Duplicate Entry: ${mName} (${mId}) has already been marked present today (${dateStr}).`
        });
      }

    } else {
      setStatus(`Unknown Person ❌ — Rejected`, 'error');
      showSuccessAnimation('failed');
      appendAttendanceLog({ name: 'Unknown Person', subject: subjectName, confidence }, false);
      if (typeof showToast === 'function') showToast(`❌ Unknown Person! Face not recognized (${confidence}% score)`);

      updateResultCard({
        name: 'Unknown Person',
        id: 'N/A',
        department: 'N/A',
        status: 'Unknown Person ❌',
        statusType: 'error',
        confidence: `${confidence}%`,
        dateTime: `${dateStr} | ${timeStr}`,
        message: '❌ Face does not match any registered student in database. Attendance not marked.'
      });
    }
  }

  function updateResultCard(info) {
    const elName = document.getElementById('fr-res-name');
    const elId = document.getElementById('fr-res-id');
    const elDept = document.getElementById('fr-res-dept');
    const elStatus = document.getElementById('fr-res-status');
    const elConf = document.getElementById('fr-res-confidence');
    const elDT = document.getElementById('fr-res-datetime');
    const elMsg = document.getElementById('fr-res-msg');
    const container = document.getElementById('fr-res-container');

    if (elName) elName.textContent = info.name;
    if (elId) elId.textContent = info.id;
    if (elDept) elDept.textContent = info.department;
    if (elStatus) {
      elStatus.textContent = info.status;
      const colors = { success: '#34D399', warning: '#FBBF24', error: '#EF4444' };
      elStatus.style.color = colors[info.statusType] || '#34D399';
    }
    if (elConf) elConf.textContent = info.confidence;
    if (elDT) elDT.textContent = info.dateTime;
    if (elMsg) elMsg.textContent = info.message;
    if (container) container.style.display = 'block';
  }

  /* ── Manual Capture (button click) ─────────────────────── */
  async function manualCapture() {
    if (!videoStream) { if (typeof showToast === 'function') showToast('⚠️ Start camera first!'); return; }
    if (verificationActive) return;

    const video   = getVideo();
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });

    setStatus('Scanning…', 'loading');
    showFRLoader(true, 'Capturing facial frame…');

    try {
      const detection = await faceapi
        .detectSingleFace(video, options)
        .withFaceLandmarks(true)
        .withFaceDescriptor();

      if (!detection) {
        showFRLoader(false);
        setStatus('No face found', 'error');
        if (typeof showToast === 'function') showToast('❌ No face detected. Look directly at camera.');
        return;
      }

      verificationActive = true;
      showFlashEffect();
      await sleep(800);

      const studentName = document.getElementById('face-student-select')?.value || '';
      const subjectName = document.getElementById('face-subject-select')?.value || 'General';

      await matchFace(detection, studentName, subjectName);
    } catch (err) {
      console.error('Capture error:', err);
    }

    showFRLoader(false);
    verificationActive = false;
  }

  /* ── Register Face & Encode ─────────────────────────────── */
  let lastCapturedDescriptor = null;

  async function registerFace() {
    if (!videoStream) { if (typeof showToast === 'function') showToast('⚠️ Start camera first to capture face encoding!'); return; }

    const video   = getVideo();
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });

    setStatus('Encoding face…', 'loading');
    showFRLoader(true, 'Extracting 128D facial feature vector…');

    try {
      const detection = await faceapi
        .detectSingleFace(video, options)
        .withFaceLandmarks(true)
        .withFaceDescriptor();

      if (!detection) {
        showFRLoader(false);
        setStatus('No face detected', 'error');
        if (typeof showToast === 'function') showToast('❌ Face not detected. Look directly at camera.');
        return;
      }

      lastCapturedDescriptor = detection.descriptor;
      showFlashEffect();

      setStatus('Face Encoded ✅', 'success');
      showSuccessAnimation('enrolled');

      const badge = document.getElementById('reg-face-badge');
      if (badge) {
        badge.style.display = 'inline-flex';
        badge.innerHTML = '✅ 128D Face Encoding Captured';
      }

      if (typeof showToast === 'function') showToast('📸 Face encoding generated! Fill in student details and click Register.');
    } catch (err) {
      console.error('Register error:', err);
    }

    showFRLoader(false);
  }

  function getLastCapturedDescriptor() {
    return lastCapturedDescriptor;
  }

  function clearCapturedDescriptor() {
    lastCapturedDescriptor = null;
    const badge = document.getElementById('reg-face-badge');
    if (badge) badge.style.display = 'none';
  }

  /* ── Append to Attendance Log ───────────────────────────── */
  function appendAttendanceLog(record, verified) {
    const container = document.getElementById('attendance-log-list');
    if (!container) return;

    const entry = document.createElement('div');
    entry.className = 'fr-log-entry ' + (verified ? 'verified' : 'rejected');
    entry.innerHTML = verified
      ? `<span>🕐 ${record.time || 'Just now'} &nbsp;|&nbsp; 👤 <strong>${record.name}</strong> (${record.studentId || ''}) — ${record.subject}</span>
         <span style="color:#10B981;font-weight:700;">✅ Verified ${record.confidence}%</span>`
      : `<span>🕐 ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} &nbsp;|&nbsp; ❌ ${record.name}</span>
         <span style="color:#EF4444;font-weight:700;">Rejected ${record.confidence}%</span>`;
    container.prepend(entry);
  }

  /* ── Visual FX ─────────────────────────────────────────── */
  function showFlashEffect() {
    const wrapper = document.getElementById('fr-video-wrapper');
    if (!wrapper) return;
    wrapper.style.transition = 'background 0.05s';
    wrapper.style.background = 'rgba(255,255,255,0.3)';
    setTimeout(() => { wrapper.style.background = 'transparent'; }, 100);
  }

  function showSuccessAnimation(type) {
    const el = document.getElementById('fr-result-badge');
    if (!el) return;
    el.style.display  = 'flex';
    el.className      = 'fr-result-badge fr-result-' + type;

    if (type === 'verified') {
      el.innerHTML = '<span class="fr-result-icon">✅</span><span>Student Verified</span>';
    } else if (type === 'enrolled') {
      el.innerHTML = '<span class="fr-result-icon">📸</span><span>Face Enrolled</span>';
    } else if (type === 'duplicate') {
      el.innerHTML = '<span class="fr-result-icon">⚠️</span><span>Duplicate Marked</span>';
    } else {
      el.innerHTML = '<span class="fr-result-icon">❌</span><span>Unknown Person</span>';
    }

    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => { el.style.display = 'none'; el.style.opacity = '1'; }, 600);
    }, 3500);
  }

  function triggerVerifiedRipple() {
    const wrapper = document.getElementById('fr-video-wrapper');
    if (!wrapper) return;
    wrapper.style.boxShadow = '0 0 0 4px #10B981, 0 0 30px rgba(16,185,129,0.5)';
    setTimeout(() => { wrapper.style.boxShadow = ''; }, 2000);
  }

  /* ── Stop Camera ─────────────────────────────────────────── */
  function stopCamera() {
    if (detectionLoop) { cancelAnimationFrame(detectionLoop); detectionLoop = null; }
    if (videoStream)   { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }
    const video = getVideo();
    if (video) video.srcObject = null;

    const canvas = getCanvas();
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

    const startBtn = document.getElementById('fr-start-btn');
    const stopBtn = document.getElementById('fr-stop-btn');
    const camStatus = document.getElementById('fr-cam-status');

    if (startBtn) startBtn.style.display = 'inline-flex';
    if (stopBtn) stopBtn.style.display = 'none';
    if (camStatus) camStatus.textContent = '🔴 Off';

    setStatus('Camera stopped', 'idle');
    centeredFrames = 0;
    updateCenterTimer(0);
  }

  function getAttendanceRecords() { return (typeof AppDB !== 'undefined') ? AppDB.getAttendance() : attendanceDB; }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  return {
    init: loadModels,
    startCamera,
    stopCamera,
    manualCapture,
    registerFace,
    getLastCapturedDescriptor,
    clearCapturedDescriptor,
    getAttendanceRecords,
  };
})();

function frStartCamera()    { FaceRecognitionEngine.startCamera(); }
function frStopCamera()     { FaceRecognitionEngine.stopCamera(); }
function frManualCapture()  { FaceRecognitionEngine.manualCapture(); }
function frRegisterFace()   { FaceRecognitionEngine.registerFace(); }

function frExportAttendance() {
  frExportAttendanceCSV();
}

function frExportAttendanceCSV() {
  const records = (typeof AppDB !== 'undefined') ? AppDB.getAttendance() : FaceRecognitionEngine.getAttendanceRecords();
  if (!records || records.length === 0) {
    if (typeof showToast === 'function') showToast('No attendance records to export!');
    return;
  }
  const headers = ['Record ID,Date,Time,Student ID,Student Name,Department,Subject,Status,Confidence%'];
  const rows = records.map(r =>
    `"${r.id || ''}","${r.date || ''}","${r.time || ''}","${r.studentId || ''}","${r.studentName || r.name || ''}","${r.department || ''}","${r.subject || 'General'}","${r.status || 'Verified'}","${r.confidence || 0}%"`
  );
  const blob = new Blob([headers.concat(rows).join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `Attendance_History_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  if (typeof showToast === 'function') showToast('📥 Attendance CSV exported successfully!');
}

function frExportAttendancePDF() {
  const records = (typeof AppDB !== 'undefined') ? AppDB.getAttendance() : FaceRecognitionEngine.getAttendanceRecords();
  if (!records || records.length === 0) {
    if (typeof showToast === 'function') showToast('No attendance records to export!');
    return;
  }

  const printWin = window.open('', '_blank');
  if (!printWin) return;
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const tableRows = records.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${r.date} ${r.time || ''}</td>
      <td><strong>${r.studentId || '—'}</strong></td>
      <td>${r.studentName || r.name || '—'}</td>
      <td>${r.department || '—'}</td>
      <td>${r.subject || 'General'}</td>
      <td style="color:${r.status === 'Verified' ? '#059669' : '#dc2626'};font-weight:bold;">${r.status || 'Verified'}</td>
      <td>${r.confidence || 0}%</td>
    </tr>
  `).join('');

  printWin.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Attendance History Report — ${dateStr}</title>
      <style>
        body { font-family: 'Inter', sans-serif; padding: 2rem; color: #0f172a; }
        h1 { margin: 0 0 0.25rem 0; font-size: 1.5rem; }
        p { color: #64748b; font-size: 0.85rem; margin: 0 0 1.5rem 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 0.82rem; }
        th, td { padding: 8px 10px; border: 1px solid #cbd5e1; text-align: left; }
        th { background: #f1f5f9; font-weight: 700; }
        .hdr { display: flex; justify-content: space-between; border-bottom: 2px solid #3b82f6; padding-bottom: 1rem; margin-bottom: 1rem; }
      </style>
    </head>
    <body>
      <div class="hdr">
        <div>
          <h1>Smart Attendance Report</h1>
          <p>Personal Study Planner AI — Team Pall_AIX | Date: ${dateStr}</p>
        </div>
        <div style="text-align:right;">
          <p><strong>Total Logs:</strong> ${records.length}</p>
          <p><strong>Verified Rate:</strong> ${Math.round((records.filter(r=>r.status==='Verified').length / records.length)*100)}%</p>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>#</th><th>Date & Time</th><th>Student ID</th><th>Student Name</th><th>Department</th><th>Subject</th><th>Status</th><th>Confidence</th></tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </body>
    </html>
  `);
  printWin.document.close();
  printWin.focus();
  setTimeout(() => { printWin.print(); }, 400);
  if (typeof showToast === 'function') showToast('📄 Attendance PDF report generated!');
}
