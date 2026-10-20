@echo off
title Chat'Maths Burkina Faso
color 0B
cd /d "%~dp0"

if exist "backend\venv\Scripts\python.exe" (
    backend\venv\Scripts\python.exe run.py
) else (
    py run.py
)

pause
