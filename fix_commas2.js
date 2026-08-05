const fs = require('fs');
let file = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');
file = file.replace(/,\s*, GlobalHeaderActions/g, ',\n  GlobalHeaderActions');
fs.writeFileSync('app/(tabs)/index.tsx', file);
console.log('Fixed index.tsx commas.');
