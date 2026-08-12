' run-hidden.vbs — עוטף פקודת node ומריץ אותה בלי חלון קונסולה גלוי.
' node.exe הוא תוכנת קונסולה — Task Scheduler מריץ אותה כרגיל עם חלון,
' גם אם המשימה עצמה "ברקע". הפתרון הסטנדרטי: להריץ דרך WScript.Shell.Run
' עם windowStyle=0 (מוסתר), שמדכא את חלון ה-console של הצאצא (node) גם.
'
' מקבל כל ארגומנט בנפרד (למשל: נתיב node.exe, ואז נתיב הסקריפט) ומצרף
' אותם למחרוזת פקודה אחת, כל אחד במרכאות משלו — כך שנתיבים עם רווחים
' (כמו "C:\Users\איתמר\...") לא נשברים.
'
' משמש ע"י register-task.ps1 ו-register-poll-task.ps1 — לא מיועד להרצה ידנית.
Set objShell = CreateObject("WScript.Shell")
Dim cmd
cmd = ""
For i = 0 To WScript.Arguments.Count - 1
  cmd = cmd & """" & WScript.Arguments(i) & """ "
Next
objShell.Run Trim(cmd), 0, True
