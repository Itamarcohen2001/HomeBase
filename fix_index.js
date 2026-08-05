const fs = require('fs');
let code = fs.readFileSync('src/ui/index.tsx', 'utf8');

// fix imports
code = code.replace(/import\s*\{\s*colors/, 'import { lightColors');
code = code.replace(/import\s*\{\s*useTheme\s*\}\s*from\s*['"]\.\.\/context\/ThemeContext['"];/g, '');
code = "import { useTheme } from '../context/ThemeContext';\n" + code;

// create useStyles
code = code.replace(/const s = StyleSheet\.create\(\{/g, `const useStyles = () => {
  const { colors } = useTheme();
  return React.useMemo(() => StyleSheet.create({`);
code = code.replace(/fill: \{ height: 8, borderRadius: 4 \},\n\}\);/g, `fill: { height: 8, borderRadius: 4 },\n  }), [colors]);\n};`);

// inject hook and s in every component
const componentsToInject = ['Checkbox', 'Screen', 'PageHeader', 'Card', 'SectionTitle', 'IconText', 'Button', 'TextLink', 'InlineMessage', 'Field', 'AmountInput', 'ProgressBar', 'IconBubble', 'EmptyState', 'Loading', 'Divider'];

componentsToInject.forEach(comp => {
  const regex = new RegExp(`(export function ${comp}\\(.*\\) \\{)`);
  code = code.replace(regex, `$1\n  const { colors } = useTheme();\n  const s = useStyles();`);
});

// for Badge
code = code.replace(/(export function Badge\(.*\) \{)/, `$1\n  const { colors } = useTheme();\n  const s = useStyles();`);

// for H1, H2, H3, Body, Muted: they use font directly which has lightColors.
// for AmountInput which has align = 'stretch' and doesn't use s: the injection still works because we just added 's' to all of them, unused 's' is fine for typecheck.

// fix default colors in signatures
code = code.replace(/color = colors\.textMuted/g, 'color = lightColors.textMuted');
code = code.replace(/color = colors\.primary/g, 'color = lightColors.primary');

fs.writeFileSync('src/ui/index.tsx', code);
