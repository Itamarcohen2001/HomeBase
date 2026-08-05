const fs = require('fs');
let code = fs.readFileSync('app/import.tsx', 'utf8');

// 1. Handle imports
if (!code.includes('useTheme')) {
  code = code.replace("import { Ionicons", "import { useTheme } from '../src/context/ThemeContext';\nimport { Ionicons");
}
code = code.replace(/import\s*\{([^}]*)\bcolors\b([^}]*)\}\s*from\s*['"]\.\.\/src\/theme['"];/g, (match, p1, p2) => {
  return `import {${p1}${p2}} from '../src/theme';`.replace(/,\s*,/g, ',').replace(/\{\s*,/g, '{').replace(/,\s*\}/g, '}');
});

// 2. Inject useTheme into components
const inject = (funcName) => {
  const regex = new RegExp(`(function ${funcName}\\s*\\([^)]*\\)\\s*(?::\\s*[^\\{]+\\s*)?\\{)`);
  if (code.match(regex)) {
    code = code.replace(regex, `$1\n  const { colors } = useTheme();`);
  }
};
inject('Import');
inject('SummaryLine');
inject('CategoryPicker');
inject('AssignmentPicker');

// 3. Inject color into Text
code = code.replace(/<Text testID=\{\`hb-import-note-\$\{i\}\`\}>\{note\}<\/Text>/g, '<Text style={{ color: colors.text }} testID={`hb-import-note-${i}`}>{note}</Text>');
code = code.replace(/<Text testID="hb-import-duplicates">/g, '<Text style={{ color: colors.text }} testID="hb-import-duplicates">');
code = code.replace(/<Text testID="hb-import-refunds">/g, '<Text style={{ color: colors.text }} testID="hb-import-refunds">');
code = code.replace(/<Text testID="hb-import-recurring-summary">/g, '<Text style={{ color: colors.text }} testID="hb-import-recurring-summary">');
code = code.replace(/<Text testID=\{testID\} style=\{\[font\.body, rtlText, \{ fontWeight: '700' \}\]\}>/g, '<Text testID={testID} style={[font.body, rtlText, { fontWeight: \'700\', color: colors.text }]}>');

fs.writeFileSync('app/import.tsx', code);
