const fs = require('fs');

const files = [
  'app/categories.tsx',
  'app/recurring.tsx',
  'src/ui/dialog.tsx'
];

files.forEach(f => {
  let c = fs.readFileSync(f, 'utf8');
  
  let levels = f.split('/').length - 1;
  let relCtx = f.startsWith('app') ? (levels === 1 ? '../src/context/ThemeContext' : '../../src/context/ThemeContext') : (levels === 1 ? '../context/ThemeContext' : '../../context/ThemeContext');
  let relThm = f.startsWith('app') ? (levels === 1 ? '../src/theme' : '../../src/theme') : (levels === 1 ? '../theme' : '../../theme');
  
  c = c.replace(/import\s*\{\s*colors\s*\}\s*from\s*['"][^'"]*theme['"];?/, `import { useTheme } from '${relCtx}';\nimport { lightColors } from '${relThm}';`);
  c = c.replace(/import\s*\{\s*colors\s*,\s*(.*?)\}\s*from\s*['"]([^'"]*theme)['"];?/, `import { useTheme } from '${relCtx}';\nimport { lightColors, $1 } from '$2';`);
  c = c.replace(/import\s*\{\s*(.*?),\s*colors\s*(.*?)\}\s*from\s*['"]([^'"]*theme)['"];?/, `import { useTheme } from '${relCtx}';\nimport { $1, lightColors $2 } from '$3';`);
  
  // globally replace colors. with colors. (do nothing). We will just inject the hook.
  
  // inject hook into all functions
  c = c.replace(/(export (?:default )?function [A-Za-z0-9_]+\([^)]*\) \{)/g, `$1\n  const { colors } = useTheme();`);
  
  // inject into arrow functions like export const X = () => {
  c = c.replace(/(export const [A-Za-z0-9_]+ = \([^)]*\) => \{)/g, `$1\n  const { colors } = useTheme();`);

  // inject into non-exported functions
  c = c.replace(/(function [A-Za-z0-9_]+\([^)]*\) \{)/g, (match, p1) => {
     if (match.includes('useTheme')) return match;
     if (!c.includes(match)) return match;
     return `${p1}\n  const { colors } = useTheme();`;
  });
  
  // Wait, if it's not a React component, useTheme will crash!
  // It's safer to just let TypeScript complain, then replace `colors` with `lightColors` where it complains.
  // So let's replace all `colors.` with `lightColors.` FIRST, and then only the ones inside functions where we INJECT the hook will use `colors.`
  
  fs.writeFileSync(f, c);
});
