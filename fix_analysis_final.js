const fs = require('fs');

let file = fs.readFileSync('app/(tabs)/analysis.tsx', 'utf8');

if (!file.includes('GlobalHeaderActions')) {
  file = file.replace(/import \{([\s\S]*?)\} from '\.\.\/\.\.\/src\/ui';/, "import { $1, GlobalHeaderActions, useTheme } from '../../src/ui';");
}

file = file.replace(/import \{ colors, rtlRow, spacing \} from '\.\.\/\.\.\/src\/theme';/, "import { rtlRow, spacing } from '../../src/theme';");

if (!file.includes('const { colors } = useTheme();')) {
  file = file.replace(/(export default function \w+\(\) \{\n)/, "$1  const { colors } = useTheme();\n");
  file = file.replace(/(function Legend\([^)]+\) \{\n)/, "$1  const { colors } = useTheme();\n");
}

file = file.replace(
  /<H2 style=\{\{ marginBottom: spacing\.md \}\}>([^<]+)<\/H2>/,
  `<View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: spacing.md, alignItems: 'center' }}>\n        <H2>$1</H2>\n        <GlobalHeaderActions />\n      </View>`
);

file = file.replace(/,\s*,/g, ',');

fs.writeFileSync('app/(tabs)/analysis.tsx', file);
console.log('Fixed analysis.tsx');
