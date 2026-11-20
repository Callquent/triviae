@echo off
rem Lanceur de secours : démarre Triviae sans Triviae.exe.
chcp 65001 >nul
cd /d "%~dp0"
"%~dp0runtime\node.exe" "%~dp0hub\hub.js"
echo.
echo Triviae s'est arrete. Appuyez sur une touche pour fermer.
pause >nul
