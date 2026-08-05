const fs = require('fs');
let code = fs.readFileSync('app/import.tsx', 'utf8');

// 1. Remove duplicate colors in SummaryLine
code = code.replace(/const \{ colors \} = useTheme\(\);\s*const \{ colors \} = useTheme\(\);/g, 'const { colors } = useTheme();');

// 2. Inject into ImportRowItem
code = code.replace(/onPickAssignment: \(\) => void;\s*\n\}\)\s*\{\s*\n\s*\/\/\s*ההסבר/g, 
  "onPickAssignment: () => void;\n}) {\n  const { colors } = useTheme();\n  // ההסבר");

fs.writeFileSync('app/import.tsx', code);
