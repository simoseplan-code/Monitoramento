@echo off
rem Baixa o Excel dos KML para a pasta DIMA. Dois cliques para rodar na hora; o Agendador do Windows tambem chama este arquivo.
cd /d "%~dp0.."
set /p CRON_SECRET=<"scripts\excel-kml.segredo.txt"
if exist "scripts\excel-kml.destino.txt" set /p DESTINO=<"scripts\excel-kml.destino.txt"
echo ==== %date% %time% ==== >> "scripts\excel-kml.log"
node scripts\baixar-excel-kml.mjs >> "scripts\excel-kml.log" 2>&1
if "%1"=="auto" exit /b 0
echo.
echo Terminou. Ultimas linhas do registro:
powershell -NoProfile -Command "Get-Content 'scripts\excel-kml.log' -Tail 5"
pause
