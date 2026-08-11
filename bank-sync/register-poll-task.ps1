# register-poll-task.ps1 — רושם משימה שרצה כל כמה דקות (ברירת מחדל: 2),
# כל היום, ובודקת אם ביקשת "סנכרון עכשיו" באתר (חיבור בנקים). זו משימה
# נפרדת מ-register-task.ps1 (שמריצה גירוד מלא פעם ביום) — הבדיקה עצמה
# קלה (קריאת רשת אחת), וגירוד אמיתי רץ רק אם יש בקשה ממתינה בפועל.
#
# הרצה (חד-פעמית, מ-PowerShell **כמנהל** — כמו register-task.ps1, דריסת
# משימה קיימת דורשת הרשאה מוגברת אצל חלק מהמשתמשים):
#   cd bank-sync
#   .\register-poll-task.ps1
#
# שינוי תדירות:
#   .\register-poll-task.ps1 -IntervalMinutes 5
#
# ביטול:
#   Unregister-ScheduledTask -TaskName "HomeBase Bank Sync Poll" -Confirm:$false

param(
  [int]$IntervalMinutes = 2,
  [string]$TaskName = "HomeBase Bank Sync Poll"
)

$ErrorActionPreference = "Stop"

$nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodePath) {
  throw "node.exe לא נמצא ב-PATH. להתקין Node.js (גרסה 22.22.2 ומעלה) ולוודא שהוא נגיש מכל תיקייה."
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pollScript = Join-Path $scriptDir "poll.js"
$configPath = Join-Path $scriptDir "config.json"

if (-not (Test-Path $configPath)) {
  Write-Warning "config.json לא נמצא ב-$scriptDir — להעתיק מ-config.example.json ולמלא לפני ההרצה הראשונה."
}

$action = New-ScheduledTaskAction -Execute $nodePath -Argument "`"$pollScript`"" -WorkingDirectory $scriptDir
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RunOnlyIfNetworkAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
  -MultipleInstances IgnoreNew

# 🎯 MultipleInstances IgnoreNew: אם בדיקה קודמת עדיין באמצע גירוד אמיתי
#    (יכול לקחת עד 90 שניות לחיבור), הבדיקה הבאה מדלגת במקום להצטבר.

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "בדיקה תכופה של בקשות `"סנכרון עכשיו`" מהאתר (bank-sync/poll.js). לוגים ב-bank-sync/logs/, רק כשיש פעילות בפועל." `
  -Force | Out-Null

Write-Host "נרשמה משימה '$TaskName' — תרוץ כל $IntervalMinutes דקות, כל היום."
Write-Host "הרצה ידנית לבדיקה מיידית:"
Write-Host "  Start-ScheduledTask -TaskName `"$TaskName`""
