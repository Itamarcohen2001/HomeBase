const fs = require('fs');

const files = [
  'app/(auth)/sign-in.tsx', 'app/(auth)/sign-up.tsx', 'app/(auth)/_layout.tsx', 'app/(tabs)/analysis.tsx', 'app/(tabs)/history.tsx', 'app/(tabs)/more.tsx', 'app/(tabs)/_layout.tsx',
  'app/account/[id].tsx', 'app/add.tsx', 'app/budgets.tsx', 'app/categories.tsx', 'app/import.tsx', 'app/members.tsx', 'app/net-worth.tsx', 'app/recurring.tsx', 'app/settings.tsx', 'app/setup.tsx', 'app/transaction/[id].tsx', 'app/welcome.tsx',
  'src/ui/assign.tsx', 'src/ui/dialog.tsx', 'src/ui/Donut.tsx', 'src/ui/LineChart.tsx', 'src/ui/MonthNav.tsx'
];

files.forEach(f => {
  let code = fs.readFileSync(f, 'utf8');
  
  if (f.startsWith('app/')) {
    let levels = f.split('/').length - 1;
    let rel = levels === 1 ? '../src/context/ThemeContext' : levels === 2 ? '../../src/context/ThemeContext' : '../../../src/context/ThemeContext';
    code = code.replace(/import \{ useTheme \} from '\.\.[^']*';/g, `import { useTheme } from '${rel}';`);
  } else if (f.startsWith('src/')) {
    let levels = f.split('/').length - 1;
    let rel = levels === 1 ? '../context/ThemeContext' : levels === 2 ? '../../context/ThemeContext' : '../../../context/ThemeContext';
    code = code.replace(/import \{ useTheme \} from '\.\.[^']*';/g, `import { useTheme } from '${rel}';`);
  }
  
  // Quick fix for components that didn't get the hook injected because they are arrow functions
  code = code.replace(/(export const [a-zA-Z0-9_]+ = \([^)]*\) => \{)/g, '$1\n  const { colors } = useTheme();');
  
  fs.writeFileSync(f, code);
});
