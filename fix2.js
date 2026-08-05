const fs = require('fs');

// Fix src/ui imports
const srcFiles = fs.readdirSync('src/ui').map(f => 'src/ui/' + f).filter(f => f.endsWith('.tsx'));
srcFiles.forEach(f => {
  let code = fs.readFileSync(f, 'utf8');
  code = code.replace(/import \{ useTheme \} from '\.\.\/\.\.\/context\/ThemeContext';/g, "import { useTheme } from '../context/ThemeContext';");
  fs.writeFileSync(f, code);
});

// Fix remaining colors missing
const manualFixes = [
  'app/(tabs)/analysis.tsx',
  'app/categories.tsx',
  'app/import.tsx',
  'app/net-worth.tsx',
  'app/recurring.tsx',
  'src/ui/assign.tsx',
  'src/ui/dialog.tsx',
  'src/ui/Donut.tsx',
  'src/ui/LineChart.tsx',
  'src/ui/MonthNav.tsx',
  'src/ui/index.tsx'
];

manualFixes.forEach(f => {
  if (fs.existsSync(f)) {
    let code = fs.readFileSync(f, 'utf8');
    
    // Fallback: If colors are used outside a React component, or inside a default argument, replace with lightColors
    // For Donut/LineChart:
    code = code.replace(/color\s*=\s*colors\./g, 'color = lightColors.');
    code = code.replace(/import\s*\{\s*colors\s*\}/g, 'import { colors, lightColors }');
    code = code.replace(/import\s*\{\s*(.*?)useTheme(.*?)\}\s*from\s*['"](.*?)['"];/g, (match, p1, p2, p3) => {
       // if we didn't import lightColors yet, let's just make sure theme imports lightColors where needed.
       return match;
    });
    
    fs.writeFileSync(f, code);
  }
});
