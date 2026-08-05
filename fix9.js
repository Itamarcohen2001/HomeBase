const fs = require('fs');

// 1. Fix categories.tsx
let catCode = fs.readFileSync('app/categories.tsx', 'utf8');
catCode = catCode.replace(/lightColors\./g, 'colors.');
fs.writeFileSync('app/categories.tsx', catCode);

// 2. Fix recurring.tsx
let recCode = fs.readFileSync('app/recurring.tsx', 'utf8');
recCode = recCode.replace(/lightColors\./g, 'colors.');
fs.writeFileSync('app/recurring.tsx', recCode);

// 3. Fix import.tsx
let importCode = fs.readFileSync('app/import.tsx', 'utf8');
importCode = importCode.replace(/import\s*\{\s*colors\s*,/g, 'import {');
importCode = importCode.replace(/,\s*colors\s*\}/g, '}');
importCode = importCode.replace(/\{\s*colors\s*\}/g, '{}');
fs.writeFileSync('app/import.tsx', importCode);
