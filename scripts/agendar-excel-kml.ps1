# Cria a tarefa do Windows que baixa o Excel dos KML de segunda a sexta, as 08:00 (horario do PC).
# Uso (PowerShell, na pasta do projeto):  .\scripts\agendar-excel-kml.ps1
# Pergunta o CRON_SECRET uma vez e guarda em scripts\excel-kml.segredo.txt (fora do git).
param(
  [string]$Segredo,
  [string]$Hora = "08:00",
  [string]$Destino = "C:\Users\tom.morais\Nextcloud\DIMA"
)
$projeto = Split-Path -Parent $PSScriptRoot
if (-not $Segredo) { $Segredo = Read-Host "Cole o valor do CRON_SECRET (da Vercel) e aperte Enter" }
$Segredo = $Segredo.Trim()
if (-not $Segredo) { Write-Host "Sem segredo, nada foi feito."; exit 1 }
Set-Content -Path "$projeto\scripts\excel-kml.segredo.txt" -Value $Segredo -Encoding ASCII -NoNewline
Set-Content -Path "$projeto\scripts\excel-kml.destino.txt" -Value $Destino -Encoding UTF8 -NoNewline

$acao = New-ScheduledTaskAction -Execute "$projeto\scripts\rodar-excel-kml.bat" -WorkingDirectory $projeto
$gatilho = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday, Tuesday, Wednesday, Thursday, Friday -At $Hora
$config = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName "Monitoramento - Excel dos KML" -Action $acao -Trigger $gatilho -Settings $config -Force | Out-Null
Write-Host "Pronto: de segunda a sexta, as $Hora, o Excel dos KML vai para $Destino"
Write-Host "Para rodar agora: de dois cliques em scripts\rodar-excel-kml.bat"
