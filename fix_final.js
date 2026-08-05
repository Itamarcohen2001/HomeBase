const fs = require('fs');

// 1. Fix src/theme.ts
let theme = fs.readFileSync('src/theme.ts', 'utf8');
if (!theme.includes('export const colors = lightColors;')) {
  theme = theme.replace(
    /(export const darkColors: typeof lightColors = \{[\s\S]*?\};)/,
    "$1\n\nexport const colors = lightColors;"
  );
  fs.writeFileSync('src/theme.ts', theme);
}

// 2. Fix app/net-worth.tsx (staleness logic)
let nw = fs.readFileSync('app/net-worth.tsx', 'utf8');
nw = nw.replace(
  /const oldest = rows\.reduce<string \| null>\(\(acc, r\) => \{\n\s*if \(\!r\.captured_at\) return acc;\n\s*return acc === null \|\| r\.captured_at < acc \? r\.captured_at : acc;\n\s*\}, null\);\n\s*return \{ total, unpriced, fromReport, oldest \};/,
  "const oldest = rows.reduce<string | null>((acc, r) => {\n      if (!r.captured_at) return acc;\n      return acc === null || r.captured_at < acc ? r.captured_at : acc;\n    }, null);\n    const newest = rows.reduce<string | null>((acc, r) => {\n      if (!r.captured_at) return acc;\n      return acc === null || r.captured_at > acc ? r.captured_at : acc;\n    }, null);\n    return { total, unpriced, fromReport, oldest, newest };"
);
nw = nw.replace(
  /<Badge icon="time-outline" color=\{nw\.isStale\(totals\.oldest\) \? colors\.warning : colors\.textMuted\}>\n\s*\{rows\.length === 0 \? 'אין חשבונות' : nw\.stalenessLabel\(totals\.oldest\)\}\n\s*<\/Badge>/,
  '<Badge icon="time-outline" color={nw.isStale(totals.newest) ? colors.warning : colors.textMuted}>\n            {rows.length === 0 ? \'אין חשבונות\' : nw.stalenessLabel(totals.newest)}\n          </Badge>'
);
fs.writeFileSync('app/net-worth.tsx', nw);

// 3. Fix app/(tabs)/analysis.tsx (GlobalHeaderActions)
let analysis = fs.readFileSync('app/(tabs)/analysis.tsx', 'utf8');
if (!analysis.includes('GlobalHeaderActions')) {
  analysis = analysis.replace(/import \{([\s\S]*?)\} from '\.\.\/\.\.\/src\/ui';/, "import { $1, GlobalHeaderActions } from '../../src/ui';");
  analysis = analysis.replace(
    /<H2 style=\{\{ marginBottom: spacing\.md \}\}>([^<]+)<\/H2>/,
    `<View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: spacing.md, alignItems: 'center' }}>\n        <H2>$1</H2>\n        <GlobalHeaderActions />\n      </View>`
  );
  analysis = analysis.replace(/,\s*, GlobalHeaderActions/g, ',\n  GlobalHeaderActions');
  fs.writeFileSync('app/(tabs)/analysis.tsx', analysis);
}

console.log('Fixed everything.');
