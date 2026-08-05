const fs = require('fs');

// We are going to reset index.tsx again just to be safe and do it perfectly
const { execSync } = require('child_process');
execSync('git checkout src/ui/index.tsx');

let code = fs.readFileSync('src/ui/index.tsx', 'utf8');

// fix imports
code = code.replace(/import\s*\{\s*colors/, 'import { lightColors');
code = code.replace(/import\s*\{\s*useTheme\s*\}\s*from\s*['"]\.\.\/context\/ThemeContext['"];/g, '');
code = "import { useTheme } from '../context/ThemeContext';\n" + code;

// create useStyles
const ssIndex = code.lastIndexOf('const s = StyleSheet.create({');
if (ssIndex !== -1) {
  const topPart = code.substring(0, ssIndex);
  let bottomPart = code.substring(ssIndex);
  
  bottomPart = bottomPart.replace('const s = StyleSheet.create({', 'const useStyles = (colors: typeof lightColors) => React.useMemo(() => StyleSheet.create({');
  bottomPart = bottomPart.replace(/\}\);\s*$/, '}), [colors]);\n');
  code = topPart + bottomPart;
}

// inject hook and s in every component
const componentsToInject = ['Checkbox', 'Badge', 'Screen', 'PageHeader', 'Card', 'SectionTitle', 'IconText', 'Button', 'TextLink', 'InlineMessage', 'Field', 'AmountInput', 'ProgressBar', 'IconBubble', 'EmptyState', 'Loading', 'Divider'];

componentsToInject.forEach(comp => {
  // Use [\\s\\S]*? to match across newlines
  const regex = new RegExp(`(export function ${comp}\\([\\s\\S]*?\\)\\s*\\{)`);
  code = code.replace(regex, `$1\n  const { colors } = useTheme();\n  const s = useStyles(colors);`);
});

// fix default colors in signatures
code = code.replace(/color = colors\.textMuted/g, 'color = lightColors.textMuted');
code = code.replace(/color = colors\.primary/g, 'color = lightColors.primary');

fs.writeFileSync('src/ui/index.tsx', code);


// Also fix the remaining 4 files: categories, recurring, dialog, Donut
const manualFixes = [
  'app/categories.tsx',
  'app/recurring.tsx',
  'src/ui/dialog.tsx',
  'src/ui/Donut.tsx' // we already added useTheme here but we need to fix "no exported member 'colors'"
];

manualFixes.forEach(f => {
  if (fs.existsSync(f)) {
    let c = fs.readFileSync(f, 'utf8');
    c = c.replace(/colors\./g, 'lightColors.');
    c = c.replace(/import\s*\{\s*colors\s*\}/g, 'import { lightColors }');
    // If it still says import { ..., colors, ... }
    c = c.replace(/,\s*colors/g, ', lightColors');
    fs.writeFileSync(f, c);
  }
});
