const fs = require('fs');
let uiCode = fs.readFileSync('src/ui/index.tsx', 'utf8');

const helpers = ['H1', 'H2', 'H3', 'Body', 'Muted'];
helpers.forEach(h => {
  const isMuted = h === 'Muted';
  const colorProp = isMuted ? 'colors.textMuted' : 'colors.text';
  const regex = new RegExp(`(export const ${h} = \\(p: TextProps\\) => )\\(\\s*<Text([^>]+)style=\\{\\[(.*?), rtlText, p\\.style\\]\\}>([\\s\\S]*?)<\\/Text>\\s*\\);`);
  uiCode = uiCode.replace(regex, `$1{\n  const { colors } = useTheme();\n  return (\n    <Text$2style={[$3, { color: ${colorProp} }, rtlText, p.style]}>$4</Text>\n  );\n};`);
});

// Now fix PageHeader
uiCode = uiCode.replace(/<Text style=\{\[font\.h2, rtlText, \{ flexShrink: 1 \}\]\}>\{title\}<\/Text>/, 
  '<Text style={[font.h2, rtlText, { flexShrink: 1, color: colors.text }]}>{title}</Text>');

fs.writeFileSync('src/ui/index.tsx', uiCode);
