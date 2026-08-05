const fs = require('fs');

const manualFixes = [
  'app/categories.tsx',
  'app/recurring.tsx',
  'src/ui/dialog.tsx'
];

manualFixes.forEach(f => {
  if (fs.existsSync(f)) {
    let c = fs.readFileSync(f, 'utf8');
    c = c.replace(/colors\./g, 'lightColors.');
    c = c.replace(/import\s*\{\s*colors\s*\}/g, 'import { lightColors }');
    c = c.replace(/,\s*colors/g, ', lightColors');
    c = c.replace(/colors\s*,/g, 'lightColors,');
    fs.writeFileSync(f, c);
  }
});
