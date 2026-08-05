const fs = require('fs');

// 1. Fix src/ui/index.tsx
let uiCode = fs.readFileSync('src/ui/index.tsx', 'utf8');

const helpers = ['H1', 'H2', 'H3', 'Body', 'Muted'];
helpers.forEach(h => {
  const isMuted = h === 'Muted';
  const colorProp = isMuted ? 'colors.textMuted' : 'colors.text';
  // We need to replace: export const H1 = (p: TextProps) => ( ... )
  // with export const H1 = (p: TextProps) => { const { colors } = useTheme(); return ( ... ); };
  const regex = new RegExp(`(export const ${h} = \\(p: TextProps\\) => )\\(\\s*<Text([^>]+)style=\\{\\[(.*?), rtlText, p\\.style\\]\\}>([\\s\\S]*?)<\\/Text>\\s*\\);`);
  uiCode = uiCode.replace(regex, `$1{\n  const { colors } = useTheme();\n  return (\n    <Text$2style={[$3, { color: ${colorProp} }, rtlText, p.style]}>$4</Text>\n  );\n};`);
});

fs.writeFileSync('src/ui/index.tsx', uiCode);

// 2. Improve darkColors in src/theme.ts
let themeCode = fs.readFileSync('src/theme.ts', 'utf8');
themeCode = themeCode.replace(/primarySoft: '#183827'/g, "primarySoft: '#1B402D'");
themeCode = themeCode.replace(/bg: '#121614'/g, "bg: '#0F1412'");
themeCode = themeCode.replace(/surface: '#1E2421'/g, "surface: '#1C2622'");
themeCode = themeCode.replace(/textMuted: '#A3B0AA'/g, "textMuted: '#B8C7C0'");
themeCode = themeCode.replace(/textFaint: '#727F79'/g, "textFaint: '#8FA19A'");
themeCode = themeCode.replace(/border: '#2C3631'/g, "border: '#3A4A43'");
themeCode = themeCode.replace(/dangerSoft: '#4A2322'/g, "dangerSoft: '#5E2C2A'");
fs.writeFileSync('src/theme.ts', themeCode);

// 3. Fix the 3 files where we hardcoded lightColors
const fixFiles = ['app/categories.tsx', 'app/recurring.tsx', 'src/ui/dialog.tsx'];
fixFiles.forEach(f => {
  if (fs.existsSync(f)) {
    let c = fs.readFileSync(f, 'utf8');
    c = c.replace(/lightColors\./g, 'colors.');
    // In src/ui/dialog.tsx, we need to inject useTheme into the `DialogProvider` maybe?
    // Let's just blindly change back to colors. and see if tsc catches anything.
    fs.writeFileSync(f, c);
  }
});
