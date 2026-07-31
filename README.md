# Team-Pall_AIX---Pallavi-Kumari

## Study‑Planner‑AI
A premium web‑app that turns a college timetable into a realistic, AI‑driven self‑study schedule.
It parses uploaded timetables, extracts class slots, discovers free windows, and automatically distributes user‑provided subjects across those windows while respecting workload limits, priorities, and exam deadlines. The result is a clean, colour‑coded weekly grid plus a fully‑functional Pomodoro timer.

Table of Contents
Project Overview
Key Features
Technology Stack
Architecture & Core Modules
Installation & Quick Start
Usage Walk‑through
Folder / File Layout
AI Scheduling Algorithm
Design & Aesthetics
Running the Development Server
Testing & Validation
Future Enhancements
Credits & License

## This is the vercel URL to open our website :-

## Overview
The Study‑Planner‑AI web app helps students optimise their weekly study time:

Upload a college timetable (image or PDF).
OCR extracts the lecture slots and automatically computes the free time windows.
Add subjects (name, priority, difficulty, exam date, attendance, remaining syllabus).
Auto‑generate a balanced study plan that fits only inside the free slots, limits the number of sessions per day, and guarantees that every subject appears at least once per week.
Interact with the schedule (edit, delete, mark‑as‑done) and use the built‑in Pomodoro timer for focused work sessions.
All this runs entirely in the browser (HTML + vanilla CSS + plain JavaScript) with a tiny Python Flask‑like dev server for static file serving.

## Key Features

Category	Feature	Description
Timetable handling	OCR‑driven parsing	ocr-timetable.js uses Tesseract (via a CDN) to read class slots from uploaded images/PDFs.
Class / Free slot separation	Generates two arrays: lectures (occupied) and freeSlots (gaps).
AI study planner	Subject‑urgency scoring	Factors: priority, proximity to exam, low attendance, difficulty, remaining syllabus.
Load‑balancing	≤ 3 sessions per day, ≤ 60 % of free‑slot time used, weighted round‑robin across subjects.
Session types rotation	Focus, Problem‑Solving, Quick Revision, Mock Practice – adds variety.
UI	VIT‑style weekly grid	Colour‑coded purple cells for lectures; plain cells for AI‑generated study blocks.
Day‑detail timeline	Chronological list of slots for the selected day with edit/delete controls.
Pomodoro timer	Encapsulated IIFE, start/pause/reset, 4‑session progress dots, custom durations (15/25/50 min).
Responsive & premium design	Smooth micro‑animations, pastel palette, Google‑Fonts Inter, subtle gradients, dark‑mode ready.
Persistence	AppDB (localStorage)	Stores timetable, free slots, subjects, generated plan, Pomodoro stats.
Export	PDF schedule export	exportSchedulePDF() creates a printable weekly plan.
Notifications	Browser alerts for upcoming exams, overdue subjects, completed Pomodoro sessions.	
Extensibility	Modular JS files (db.js, app.js, notifications.js)	Easy to hook a real backend later.

## Technology Stack

Layer	Tool / Library	Reason
Frontend	HTML5	Semantic structure (<header>, <section>, <table>).
Vanilla CSS	Full visual control; no framework bloat.
JavaScript (ES2022)	Core logic, modularised per responsibility.
Google Fonts – Inter	Modern, legible, premium feel.
Tesseract.js (CDN)	Client‑side OCR for timetable image parsing.
jsPDF (CDN)	PDF generation of the weekly plan.
Backend (dev only)	Python 3.11 (standard library http.server)	Serves static assets; zero‑dependency, fast to start.
Build / Run	Antigravity CLI (agy)	Workspace & task orchestration (already used in the environment).
Version control	Git (implicit)	For future contributions.

## Architecture & Core Modules


src/
│
├─ index.html          (entry point – redirects to dashboard)
├─ planner.html         ← main UI for timetable & schedule
│
├─ css/
│   └─ styles.css      ← design system, colour tokens, animations
│
├─ js/
│   ├─ db.js           ← LocalStorage wrapper (CRUD ops)
│   ├─ ocr-timetable.js← Image → lecture extraction
│   ├─ study-planner.js← AI scheduling algorithm + palette
│   ├─ app.js           ← UI glue (event listeners, rendering)
│   ├─ notifications.js← toast/alert handling
│   └─ pomodoro.js      ← encapsulated timer (IIFE)
│
└─ server/
    └─ run_server.py   ← tiny HTTP file server (daemon)
All modules are pure‑JavaScript and import each other via <script type="module"> to keep a clean dependency graph.

## Installation & Quick Start

Clone the repo (or copy the study-planner-agent folder).

bash


git clone https://github.com/your‑username/Study-Planner-AI.git
cd Study-Planner-AI
(Optional) Create a virtual environment – the server uses only the std‑lib, so no packages are required.

bash


python -m venv venv
.\venv\Scripts\activate
Start the dev server (Antigravity already launched one, but you can run it manually).

powershell


cd C:\Users\LOQ\.gemini\antigravity\scratch\study-planner-agent
python run_server.py  

Enjoy! Upload a timetable, add subjects, hit Auto‑Generate, and start using the Pomodoro timer.

## Usage Walk‑through

Step	Action	Result
1	Click the Upload Timetable area → select an image/PDF.	OCRTimetableScanner extracts lectures → AppDB.saveTimetable() stores lectures & freeSlots.
2	Open AI Studio (right‑hand sidebar) → Add Subject. Fill name, priority, exam date, etc.	Subjects are persisted in AppDB.
3	Press Auto‑Generate Study Schedule.	AIStudyPlanner.generateSchedule() runs, creates a balanced weekly plan, saved as studyPlan.
4	View the weekly grid – coloured class cells (purple) and plain study blocks (subject name + pastel background).	Clicking a plain block scrolls the day‑detail view to that slot.
5	Use the Pomodoro timer – start, pause, reset, choose duration.	Timer runs in its own IIFE, no longer collides with other globals.
6	Export → click Download PDF.	exportSchedulePDF() produces a printable version.
7	Edit or delete any block → the plan updates instantly, and the queue is saved to localStorage.	
Folder / File Layout


study-planner-agent/
│
├─ planner.html                ← main page (grid + day timeline)
├─ css/
│   └─ styles.css            ← design tokens, dark mode, animations
├─ js/
│   ├─ db.js                 ← CRUD wrapper around localStorage
│   ├─ ocr-timetable.js      ← client‑side OCR & parsing
│   ├─ study-planner.js      ← AI scheduler, urgency scoring
│   ├─ app.js                ← UI glue, event wiring
│   ├─ pomodoro.js          ← self‑contained timer
│   └─ notifications.js      ← toast UI
└─ run_server.py             ← simple static HTTP server (daemon)
Key entry points

File	Primary responsibility
planner.html	Layout, grid rendering, legends, export button
study-planner.js	generateSchedule(), subject‑scoring, colour palette
ocr-timetable.js	scanTimetableImage(), production of lectures/freeSlots
db.js	saveTimetable(), loadSubjects(), CRUD for every entity
app.js	Render functions (renderGrid(), renderDaySchedule()), UI listeners
pomodoro.js	Timer logic, session‑dot UI, persistence of completed pomodoros
run_server.py	http.server‑based static file server (daemon)

## AI Scheduling Algorithm (High‑Level)

Collect free slots – gaps between sorted lecture intervals for each day.
Rank subjects – score = priorityWeight + examProximity + attendancePenalty + difficultyWeight + syllabusRemaining.
Create a work‑basket – each subject repeats desiredSessionsPerWeek times (derived from score).
Iterate days (Monday → Sunday):
Shuffle the basket to avoid bias.
For each free slot:
If the slot length >= MIN_SESSION_DURATION (30 min) and current day sessions < MAX_SESSIONS_PER_DAY (3).
Pick the next subject from the basket, assign a random SESSION_TYPE (Focus, Problem‑Solving, etc.).
Trim the slot to the session length, push the block to studyPlan[day].
Stop when no more free slots or basket empty.
Post‑process – ensure every subject appears at least once; if missing, re‑inject into the most spacious free slot of the week.
Persist – AppDB.saveStudyPlan(studyPlan).
The algorithm guarantees:

Balanced daily load (≤ 3 sessions, ≤ 60 % of free‑time).
Full‑week coverage (all subjects appear).
Variety (different session types, colour palette per subject).

## Design & Aesthetics

Colour palette – soft pastel backgrounds per subject (PALETTE in study-planner.js) plus a distinctive purple for class slots.
Typography – Google Font Inter (400/600) for clean readability.
Micro‑animations – fade‑in rows, hover elevation, button ripple effect.
Responsive layout – grid collapses to a single column on < 600 px, ensuring mobile usability.
Dark‑mode ready – CSS variables (--bg, --text, --accent) switch with prefers-color-scheme.
Icons – Heroicons (inline SVG) for edit, delete, pomodoro controls.
All visual decisions were made to give the feel of a premium productivity app without any external UI frameworks.

## Running the Development Server
The repository ships a tiny Python script (run_server.py) that:

python


#!/usr/bin/env python3

# Simple static server for development – serves files from the project root.

import http.server, socketserver, pathlib, os
PORT = 8080
handler = http.server.SimpleHTTPRequestHandler
os.chdir(pathlib.Path(__file__).parent)   # serve from the project folder
with socketserver.TCPServer(("", PORT), handler) as httpd:
    print(f"Serving at http://127.0.0.1:{PORT}")
    httpd.serve_forever()
Runs as a daemon in Antigravity’s background task list (task‑1709).

To stop it:

powershell


ag task list               # find the task ID
ag task kill 368b30da-...-task-1709

## Testing & Validation

What to test	How
OCR accuracy	Upload a known‑format timetable image, verify that all lectures appear in the grid (purple cells).
Schedule feasibility	Click Auto‑Generate, then ensure no day exceeds 3 sessions and free‑slot usage stays ≤ 60 %.
Subject coverage	Every added subject must appear at least once in the week.
Pomodoro functionality	Start, pause, reset; confirm the session‑dot progress updates and persists after page reload.
Export	Click Download PDF, open the file, verify layout matches the on‑screen schedule.
Responsive design	Resize the browser to mobile width, ensure grid collapses and controls remain usable.
All tests are manual for now; the code is deliberately lightweight to make future unit‑test integration straightforward.

## Future Enhancements
Idea	Description
Backend API	Replace localStorage with a real REST API (Node/Express or FastAPI) for multi‑device sync.
Authentication	OAuth2 / JWT so each student has a private schedule.
Advanced AI	Plug in a LLM to generate custom study notes per session (instead of static subject names).
Calendar Export	iCal / Google Calendar integration for automatic event creation.
Push Notifications	Browser push for upcoming pomodoros or exam reminders.
Dark‑mode toggle	UI switch (currently auto‑detect).
Unit & integration tests	Jest + Playwright for JavaScript and PyTest for the dev server.

## Credits & License
Author – Senior Full‑Stack Developer (ChatGPT‑Powered Antigravity Agent).
Libraries – Tesseract.js (OCR), jsPDF (PDF export), Heroicons (SVG icons).
Font – Inter (Google Fonts).
License – MIT – feel free to reuse, modify, and extend.
