const fs = require('fs');
let code = fs.readFileSync('src/ui/index.tsx', 'utf8');

// fix imports
code = code.replace(/import\s*\{\s*colors/, 'import { lightColors');
code = code.replace(/import\s*\{\s*useTheme\s*\}\s*from\s*['"]\.\.\/context\/ThemeContext['"];/g, '');
code = "import { useTheme } from '../context/ThemeContext';\n" + code;

// find the exact index of `const s = StyleSheet.create({`
const ssIndex = code.lastIndexOf('const s = StyleSheet.create({');
if (ssIndex !== -1) {
  const topPart = code.substring(0, ssIndex);
  let bottomPart = code.substring(ssIndex);
  
  bottomPart = bottomPart.replace('const s = StyleSheet.create({', 'const useStyles = (colors: typeof lightColors) => React.useMemo(() => StyleSheet.create({');
  // replace the last '});' with '}), [colors]);'
  bottomPart = bottomPart.replace(/\}\);\s*$/, '}), [colors]);\n');
  code = topPart + bottomPart;
}

// inject hook and s in every component
const componentsToInject = ['Checkbox', 'Screen', 'PageHeader', 'Card', 'SectionTitle', 'IconText', 'Button', 'TextLink', 'InlineMessage', 'Field', 'AmountInput', 'ProgressBar', 'IconBubble', 'EmptyState', 'Loading', 'Divider'];

componentsToInject.forEach(comp => {
  const regex = new RegExp(`(export function ${comp}\\(.*\\) \\{)`);
  code = code.replace(regex, `$1\n  const { colors } = useTheme();\n  const s = useStyles(colors);`);
});

// for Badge
code = code.replace(/(export function Badge\(.*\) \{)/, `$1\n  const { colors } = useTheme();\n  const s = useStyles(colors);`);

// fix default colors in signatures
code = code.replace(/color = colors\.textMuted/g, 'color = lightColors.textMuted');
code = code.replace(/color = colors\.primary/g, 'color = lightColors.primary');

fs.writeFileSync('src/ui/index.tsx', code);
