@echo off
setlocal
set ELECTRON_RUN_AS_NODE=
cd /d "%~dp0"

:: Check for administrative rights
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

if exist "dist\win-unpacked\NetMask.exe" (
    start "" "%~dp0dist\win-unpacked\NetMask.exe"
    exit /b
)
node "%~dp0scripts\run.js"
