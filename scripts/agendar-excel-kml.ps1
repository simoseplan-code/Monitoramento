# Cria a tarefa do Windows que baixa o Excel dos KML de segunda a sexta, as 08:00 (horario do PC).
# Uso (PowerShell, na pasta do projeto):  .\scripts\agendar-excel-kml.ps1 -Segredo "valor do CRON_SECRET"
param(
  [Parameter(Mandatory = $true)][string]$Segredo,
  [string]$Hora = "08:00",
  [string]$Destino = "C:\Users\tom.morais\Nextcloud\DIMA"
)
$projeto = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source
$cmd = "`$env:CRON_SECRET='$Segredo'; `$env:DESTINO='$Destino'; Set-Location '$projeto'; & '$node' scripts\baixar-excel-kml.mjs *>> '$projeto\scripts\excel-kml.log'"
$acao = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -Command `"$cmd`""
$gatilho = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday, Tuesday, Wednesday, Thursday, Friday -At $Hora
$config = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName "Monitoramento - Excel dos KML" -Action $acao -Trigger $gatilho -Settings $config -Force | Out-Null
Write-Host "Pronto: de segunda a sexta, as $Hora, o Excel dos KML vai para $Destino"
