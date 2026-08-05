const fs = require('fs');

const tscOutput = `
app/(tabs)/analysis.tsx(36,29): error TS2304: Cannot find name 'colors'.
app/categories.tsx(234,48): error TS2304: Cannot find name 'colors'.
app/categories.tsx(253,34): error TS2304: Cannot find name 'colors'.
app/categories.tsx(271,67): error TS2304: Cannot find name 'colors'.
app/categories.tsx(273,56): error TS2304: Cannot find name 'colors'.
app/categories.tsx(284,68): error TS2304: Cannot find name 'colors'.
app/import.tsx(814,25): error TS2304: Cannot find name 'colors'.
app/import.tsx(842,19): error TS2304: Cannot find name 'colors'.
app/import.tsx(844,21): error TS2304: Cannot find name 'colors'.
app/import.tsx(845,21): error TS2304: Cannot find name 'colors'.
app/import.tsx(877,56): error TS2304: Cannot find name 'colors'.
app/import.tsx(878,67): error TS2304: Cannot find name 'colors'.
app/import.tsx(886,48): error TS2304: Cannot find name 'colors'.
app/import.tsx(888,66): error TS2304: Cannot find name 'colors'.
app/import.tsx(891,58): error TS2304: Cannot find name 'colors'.
app/import.tsx(909,30): error TS2304: Cannot find name 'colors'.
app/import.tsx(910,37): error TS2304: Cannot find name 'colors'.
app/import.tsx(918,22): error TS2304: Cannot find name 'colors'.
app/import.tsx(920,68): error TS2304: Cannot find name 'colors'.
app/import.tsx(921,60): error TS2304: Cannot find name 'colors'.
app/import.tsx(927,45): error TS2304: Cannot find name 'colors'.
app/import.tsx(933,37): error TS2304: Cannot find name 'colors'.
app/import.tsx(938,49): error TS2304: Cannot find name 'colors'.
app/import.tsx(944,52): error TS2304: Cannot find name 'colors'.
app/import.tsx(944,71): error TS2304: Cannot find name 'colors'.
app/import.tsx(951,41): error TS2304: Cannot find name 'colors'.
app/import.tsx(1004,30): error TS2304: Cannot find name 'colors'.
app/import.tsx(1034,55): error TS2304: Cannot find name 'colors'.
app/import.tsx(1035,66): error TS2304: Cannot find name 'colors'.
app/import.tsx(1039,76): error TS2304: Cannot find name 'colors'.
app/import.tsx(1099,30): error TS2304: Cannot find name 'colors'.
app/net-worth.tsx(573,62): error TS2304: Cannot find name 'colors'.
app/net-worth.tsx(584,53): error TS2304: Cannot find name 'colors'.
app/net-worth.tsx(584,69): error TS2304: Cannot find name 'colors'.
app/net-worth.tsx(590,50): error TS2304: Cannot find name 'colors'.
app/recurring.tsx(291,48): error TS2304: Cannot find name 'colors'.
app/recurring.tsx(299,34): error TS2304: Cannot find name 'colors'.
app/recurring.tsx(320,51): error TS2304: Cannot find name 'colors'.
app/recurring.tsx(323,73): error TS2304: Cannot find name 'colors'.
app/recurring.tsx(323,94): error TS2304: Cannot find name 'colors'.
app/recurring.tsx(378,66): error TS2304: Cannot find name 'colors'.
app/recurring.tsx(379,77): error TS2304: Cannot find name 'colors'.
app/recurring.tsx(383,74): error TS2304: Cannot find name 'colors'.
src/ui/assign.tsx(82,33): error TS2304: Cannot find name 'colors'.
src/ui/assign.tsx(82,54): error TS2304: Cannot find name 'colors'.
src/ui/assign.tsx(83,40): error TS2304: Cannot find name 'colors'.
src/ui/assign.tsx(83,65): error TS2304: Cannot find name 'colors'.
src/ui/assign.tsx(88,55): error TS2304: Cannot find name 'colors'.
src/ui/assign.tsx(88,76): error TS2304: Cannot find name 'colors'.
src/ui/assign.tsx(89,62): error TS2304: Cannot find name 'colors'.
src/ui/dialog.tsx(43,46): error TS2304: Cannot find name 'colors'.
src/ui/dialog.tsx(44,47): error TS2304: Cannot find name 'colors'.
src/ui/dialog.tsx(45,41): error TS2304: Cannot find name 'colors'.
src/ui/Donut.tsx(94,64): error TS2304: Cannot find name 'colors'.
src/ui/MonthNav.tsx(35,61): error TS2304: Cannot find name 'colors'.
src/ui/MonthNav.tsx(47,75): error TS2304: Cannot find name 'colors'.
src/ui/MonthNav.tsx(47,91): error TS2304: Cannot find name 'colors'.
`;

const lines = tscOutput.split('\n').map(l => l.trim()).filter(l => l.includes("Cannot find name 'colors'"));

const injected = new Set();
const modifiedFiles = new Set();

lines.forEach(l => {
  const match = l.match(/^(.*)\((\d+),\d+\):/);
  if (!match) return;
  const file = match[1];
  const lineNum = parseInt(match[2], 10) - 1;
  
  if (!fs.existsSync(file)) return;
  
  let codeLines = fs.readFileSync(file, 'utf8').split('\n');
  
  // Go upwards from lineNum to find the nearest function or component start
  for (let i = lineNum; i >= 0; i--) {
    const lineStr = codeLines[i];
    if (lineStr.includes('=> {') || lineStr.match(/(function.*\{)/) || lineStr.includes(') {')) {
      const injectKey = file + ':' + i;
      if (!injected.has(injectKey)) {
        // Double check if we didn't already manually inject
        if (!codeLines[i+1].includes('useTheme()')) {
          codeLines.splice(i+1, 0, '  const { colors } = useTheme();');
          injected.add(injectKey);
          modifiedFiles.add(file);
        }
      }
      break;
    }
  }
  
  fs.writeFileSync(file, codeLines.join('\n'));
});

console.log('Fixed ' + modifiedFiles.size + ' files');
