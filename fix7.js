const fs = require('fs');
const fixFiles = ['app/categories.tsx', 'app/recurring.tsx', 'src/ui/dialog.tsx'];
fixFiles.forEach(f => {
  if (fs.existsSync(f)) {
    let c = fs.readFileSync(f, 'utf8');
    c = c.replace(/colors\./g, 'lightColors.');
    fs.writeFileSync(f, c);
  }
});
