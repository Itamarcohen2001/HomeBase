const fs = require('fs');
let code = fs.readFileSync('app/import.tsx', 'utf8');

// 1. Add useTheme import
if (!code.includes('useTheme')) {
  code = code.replace(/import \{[^}]*\}\s*from\s*['"]react-native['"];/, match => `${match}\nimport { useTheme } from '../src/context/ThemeContext';`);
}

// 2. Remove colors from theme import
code = code.replace(/import\s*\{([^}]*)\bcolors\b([^}]*)\}\s*from\s*['"]\.\.\/src\/theme['"];/g, (match, p1, p2) => {
  let inner = `${p1}${p2}`.replace(/,\s*,/g, ',').replace(/^\s*,/, '').replace(/,\s*$/, '');
  return inner.trim() ? `import { ${inner} } from '../src/theme';` : ``;
});

// 3. Inject useTheme into components
const components = ['SummaryLine', 'ImportRowItem', 'CategoryPicker', 'AssignmentPicker', 'WebFileInput'];
components.forEach(funcName => {
  const regex = new RegExp(`(function ${funcName}\\s*\\([^)]*\\)\\s*(?::\\s*[^\\{]+\\s*)?\\{)`);
  if (code.match(regex)) {
    code = code.replace(regex, `$1\n  const { colors } = useTheme();`);
  }
});
// Handle export default function Import
if (!code.match(/export default function Import\(\)\s*\{\s*const \{ colors \} = useTheme\(\);/)) {
  code = code.replace(/export default function Import\(\)\s*\{/, "export default function Import() {\n  const { colors } = useTheme();");
}

// 4. Inject colors.text into missing Text tags
code = code.replace(/<Text testID=\{\`hb-import-note-\$\{i\}\`\}>\{note\}<\/Text>/g, '<Text style={{ color: colors.text }} testID={`hb-import-note-${i}`}>{note}</Text>');
code = code.replace(/<Text testID="hb-import-duplicates">/g, '<Text style={{ color: colors.text }} testID="hb-import-duplicates">');
code = code.replace(/<Text testID="hb-import-refunds">/g, '<Text style={{ color: colors.text }} testID="hb-import-refunds">');
code = code.replace(/<Text testID="hb-import-recurring-summary">/g, '<Text style={{ color: colors.text }} testID="hb-import-recurring-summary">');
code = code.replace(/<Text testID=\{testID\} style=\{\[font\.body, rtlText, \{ fontWeight: '700' \}\]\}>/g, '<Text testID={testID} style={[font.body, rtlText, { fontWeight: \'700\', color: colors.text }]}>');

fs.writeFileSync('app/import.tsx', code);
