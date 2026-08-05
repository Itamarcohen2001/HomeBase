const fs = require('fs');
let code = fs.readFileSync('src/ui/index.tsx', 'utf8');

if (!code.includes('import { useTheme }')) {
  code = code.replace("import { font", "import { useTheme } from '../context/ThemeContext';\nimport { font");
}

code = code.replace(/import\s*\{([^}]*)\bcolors\b([^}]*)\}\s*from\s*['"]\.\.\/theme['"];/g, (match, p1, p2) => {
  let inner = `${p1}${p2}`.replace(/,\s*,/g, ',').replace(/^\s*,/, '').replace(/,\s*$/, '');
  return inner.trim() ? `import { ${inner} } from '../theme';` : ``;
});

fs.writeFileSync('src/ui/index.tsx', code);
