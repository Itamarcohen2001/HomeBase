# register-task.ps1 — רושם משימה יומית ב-Windows Task Scheduler שמריצה
# node sync.js בלי חלון גלוי. זה הצעד הידני היחיד בכל הזרימה — אחריו
# הסנכרון רץ לבד, גם אם המחשב היה כבוי בשעה שנקבעה (StartWhenAvailable).
#
# הרצה (חד-פעמית, מ-PowerShell רגיל — לא חייב הרשאת מנהל):
#   cd bank-sync
#   .\register-task.ps1
#
# שינוי שעת הרצה:
#   .\register-task.ps1 -Time "07:30"
#
# ביטול המשימה בעתיד:
#   Unregister-ScheduledTask -TaskName "HomeBase Bank Sync" -Confirm:$false

param(
  [string]$Time = "06:30",
  [string]$TaskName = "HomeBase Bank Sync"
)

$ErrorActionPreference = "Stop"

$nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodePath) {
  throw "node.exe לא נמצא ב-PATH. להתקין Node.js (גרסה 22.22.2 ומעלה) ולוודא שהוא נגיש מכל תיקייה."
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$syncScript = Join-Path $scriptDir "sync.js"
$configPath = Join-Path $scriptDir "config.json"

if (-not (Test-Path $configPath)) {
  Write-Warning "config.json לא נמצא ב-$scriptDir — להעתיק מ-config.example.json ולמלא לפני ההרצה הראשונה."
}

$action = New-ScheduledTaskAction -Execute $nodePath -Argument "`"$syncScript`"" -WorkingDirectory $scriptDir
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RunOnlyIfNetworkAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1)

# ⚠️ נרשמת עבור המשתמש הנוכחי, רצה רק כשהוא מחובר — בכוונה לא "בין אם
#    מחובר ובין אם לא", כי זה היה דורש לשמור את סיסמת ה-Windows במשימה
#    עצמה. זה גם עקבי עם DPAPI (scope='CurrentUser') ב-lib/crypto.js.
Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "סנכרון יומי אוטומטי של תנועות מהבנקים המחוברים ל-HomeBase (bank-sync/sync.js). לוגים ב-bank-sync/logs/." `
  -Force | Out-Null

Write-Host "נרשמה משימה '$TaskName' — תרוץ כל יום בסביבות $Time (וגם בהפעלה הראשונה של המחשב אחרי שעה זו, אם היה כבוי)."
Write-Host "הרצה ידנית לבדיקה מיידית:"
Write-Host "  Start-ScheduledTask -TaskName `"$TaskName`""
Write-Host "לוגים:"
Write-Host "  Get-Content (Join-Path `"$scriptDir`" 'logs\sync-*.log') -Tail 20"
