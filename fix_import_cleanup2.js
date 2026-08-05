const fs = require('fs');
let code = fs.readFileSync('app/import.tsx', 'utf8');

// Inject into CategoryPicker
code = code.replace(/onSelect: \(categoryId: string \| null\) => void;\s*\n\}\)\s*\{/g, 
  match => `${match}\n  const { colors } = useTheme();`);

// Inject into AssignmentPicker
code = code.replace(/onSelect: \(assignedTo: string \| null\) => void;\s*\n\}\)\s*\{/g, 
  match => `${match}\n  const { colors } = useTheme();`);

// Inject into WebFileInput
code = code.replace(/testID\?: string;\s*\n\}\)\s*\{/g, 
  match => `${match}\n  const { colors } = useTheme();`);

fs.writeFileSync('app/import.tsx', code);
