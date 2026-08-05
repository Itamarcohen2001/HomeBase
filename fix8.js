const fs = require('fs');

// 1. Fix MonthNav.tsx
let monthNav = fs.readFileSync('src/ui/MonthNav.tsx', 'utf8');
monthNav = monthNav.replace(
  "<Text style={[font.body, rtlText, { fontWeight: '700' }]}>{monthLabel(month)}</Text>",
  "<Text style={[font.body, rtlText, { fontWeight: '700', color: colors.text }]}>{monthLabel(month)}</Text>"
);
fs.writeFileSync('src/ui/MonthNav.tsx', monthNav);

// 2. Fix import.tsx
let importCode = fs.readFileSync('app/import.tsx', 'utf8');
importCode = importCode.replace(
  /<Text testID=\{`hb-import-note-\$\{i\}`\}>\{note\}<\/Text>/g,
  "<Text style={{ color: colors.text }} testID={`hb-import-note-${i}`}>{note}</Text>"
);
importCode = importCode.replace(
  /<Text testID="hb-import-duplicates">/g,
  '<Text style={{ color: colors.text }} testID="hb-import-duplicates">'
);
importCode = importCode.replace(
  /<Text testID="hb-import-refunds">/g,
  '<Text style={{ color: colors.text }} testID="hb-import-refunds">'
);
importCode = importCode.replace(
  /<Text testID="hb-import-recurring-summary">/g,
  '<Text style={{ color: colors.text }} testID="hb-import-recurring-summary">'
);
importCode = importCode.replace(
  /<Text testID=\{testID\} style=\{\[font\.body, rtlText, \{ fontWeight: '700' \}\]\}>/g,
  "<Text testID={testID} style={[font.body, rtlText, { fontWeight: '700', color: colors.text }]}>"
);
fs.writeFileSync('app/import.tsx', importCode);

// 3. Fix categories.tsx
let catCode = fs.readFileSync('app/categories.tsx', 'utf8');
if (!catCode.includes('import { useTheme }')) {
  catCode = catCode.replace("import { lightColors", "import { useTheme } from '../src/context/ThemeContext';\nimport { lightColors");
}
catCode = catCode.replace("export default function Categories() {", "export default function Categories() {\n  const { colors } = useTheme();");
catCode = catCode.replace("function CategoryEditor({", "function CategoryEditor({\n  visible,\n  category,\n  kind,\n  householdId,\n  onClose,\n  onSaved,\n}: {\n  visible: boolean;\n  category: Category | null;\n  kind: Kind;\n  householdId: string | null;\n  onClose: () => void;\n  onSaved: () => void;\n}) {\n  const { colors } = useTheme();");
// Now strip the old function signature from CategoryEditor
catCode = catCode.replace(/function CategoryEditor\(\{\s*visible,\s*category,\s*kind,\s*householdId,\s*onClose,\s*onSaved,\s*\}\:\s*\{[\s\S]*?\}\)\s*\{\s*const \{ colors \} = useTheme\(\);/, "function CategoryEditor({\n  visible,\n  category,\n  kind,\n  householdId,\n  onClose,\n  onSaved,\n}: {\n  visible: boolean;\n  category: Category | null;\n  kind: Kind;\n  householdId: string | null;\n  onClose: () => void;\n  onSaved: () => void;\n}) {\n  const { colors } = useTheme();");
catCode = catCode.replace(/lightColors\./g, 'colors.');
fs.writeFileSync('app/categories.tsx', catCode);

// 4. Fix recurring.tsx
let recCode = fs.readFileSync('app/recurring.tsx', 'utf8');
if (!recCode.includes('import { useTheme }')) {
  recCode = recCode.replace("import { lightColors", "import { useTheme } from '../src/context/ThemeContext';\nimport { lightColors");
}
recCode = recCode.replace("export default function Recurring() {", "export default function Recurring() {\n  const { colors } = useTheme();");
recCode = recCode.replace(/function RuleEditor\(\{\s*visible,\s*rule,\s*categories,\s*sharedAvailable,\s*onClose,\s*onSaved,\s*\}\:\s*\{[\s\S]*?\}\)\s*\{/, "function RuleEditor({\n  visible,\n  rule,\n  categories,\n  sharedAvailable,\n  onClose,\n  onSaved,\n}: {\n  visible: boolean;\n  rule: RecurringRule | null;\n  categories: Category[];\n  sharedAvailable: boolean;\n  onClose: () => void;\n  onSaved: () => void;\n}) {\n  const { colors } = useTheme();");
recCode = recCode.replace(/lightColors\./g, 'colors.');
fs.writeFileSync('app/recurring.tsx', recCode);

// 5. Fix dialog.tsx
let dialogCode = fs.readFileSync('src/ui/dialog.tsx', 'utf8');
if (!dialogCode.includes('import { useTheme }')) {
  dialogCode = dialogCode.replace("import { lightColors", "import { useTheme } from '../context/ThemeContext';\nimport { lightColors");
}
dialogCode = dialogCode.replace("export function DialogProvider({ children }: { children: React.ReactNode }) {", "export function DialogProvider({ children }: { children: React.ReactNode }) {\n  const { colors } = useTheme();");
// Replace in DialogProvider scope
let dialogParts = dialogCode.split('function DialogButton');
dialogParts[0] = dialogParts[0].replace(/lightColors\./g, 'colors.');
dialogCode = dialogParts.join('function DialogButton');
fs.writeFileSync('src/ui/dialog.tsx', dialogCode);
