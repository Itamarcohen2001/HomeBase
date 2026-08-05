const fs = require('fs');
const files = [
  'src/ui/assign.tsx', 'src/ui/dialog.tsx', 'src/ui/Donut.tsx', 'src/ui/LineChart.tsx', 'src/ui/MonthNav.tsx',
  'app/(auth)/sign-in.tsx', 'app/(auth)/sign-up.tsx', 'app/(auth)/_layout.tsx', 'app/(tabs)/analysis.tsx', 'app/(tabs)/history.tsx', 'app/(tabs)/more.tsx', 'app/(tabs)/_layout.tsx',
  'app/account/[id].tsx', 'app/add.tsx', 'app/budgets.tsx', 'app/categories.tsx', 'app/import.tsx', 'app/members.tsx', 'app/net-worth.tsx', 'app/recurring.tsx', 'app/settings.tsx', 'app/setup.tsx', 'app/transaction/[id].tsx', 'app/welcome.tsx'
];

files.forEach(f => {
  let code = fs.readFileSync(f, 'utf8');
  if (!code.includes('colors')) return;
  
  let levels = f.split('/').length - 1;
  let relPathContext = levels === 1 ? '../context/ThemeContext' : levels === 2 ? '../../src/context/ThemeContext' : '../../../src/context/ThemeContext';
  
  if (code.includes('import { useTheme }')) return;

  code = code.replace(/import\s*\{\s*colors\s*\}\s*from\s*['"][.\/a-zA-Z0-9]+theme['"];?/g, '');
  code = code.replace(/import\s*\{\s*colors\s*,\s*/g, 'import { ');
  code = code.replace(/,\s*colors\s*\}/g, ' }');
  
  code = `import { useTheme } from '${relPathContext}';\n` + code;
  
  // Inject const { colors } = useTheme(); in all export functions
  code = code.replace(/(export (?:default )?function [a-zA-Z0-9_]+\([^)]*\)\s*\{)/g, '$1\n  const { colors } = useTheme();');
  
  // Inject for export function that has return type e.g. export function X(): JSX.Element {
  code = code.replace(/(export (?:default )?function [a-zA-Z0-9_]+\([^)]*\):\s*[a-zA-Z0-9_<>]+\s*\{)/g, '$1\n  const { colors } = useTheme();');
  
  fs.writeFileSync(f, code);
  console.log('Refactored ' + f);
});
