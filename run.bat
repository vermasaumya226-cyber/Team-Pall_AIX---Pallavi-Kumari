@echo off
title Personal Study Planner Agent - Launch Server
cd /d "%~dp0"
echo Launching Personal Study Planner Agent Web Application...
python run_server.py
pause
