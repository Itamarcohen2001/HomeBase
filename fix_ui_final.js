const fs = require('fs');
let c = fs.readFileSync('src/ui/index.tsx', 'utf8');
c = c.replace(/color = colors\.textMuted,/g, 'color,');
c = c.replace(/color = colors\.primary,/g, 'color,');

c = c.replace(
  /export function Badge\(([\s\S]*?)const \{ colors \} = useTheme\(\);/g,
  `export function Badge($1const { colors } = useTheme();\n  if (color === undefined) color = colors.textMuted;`
);

c = c.replace(
  /export function TextLink\(([\s\S]*?)const \{ colors \} = useTheme\(\);/g,
  `export function TextLink($1const { colors } = useTheme();\n  if (color === undefined) color = colors.primary;`
);

fs.writeFileSync('src/ui/index.tsx', c);
console.log('Final UI args fixed.');
