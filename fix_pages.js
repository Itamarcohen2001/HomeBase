const fs = require('fs');

function fix(filename) {
  let file = fs.readFileSync(filename, 'utf8');
  
  // Add useTheme import if missing
  if (!file.includes('useTheme')) {
    file = file.replace(/import \{([^}]+)\} from '\.\.?\/\.\.?\/src\/ui';/, "import { $1, useTheme } from '../../src/ui';");
    file = file.replace(/import \{([^}]+)\} from '\.\.\/src\/ui';/, "import { $1, useTheme } from '../src/ui';");
  }
  
  // Inject const { colors } = useTheme(); into function body
  file = file.replace(/(export default function \w+\(\) \{\n)/, "$1  const { colors } = useTheme();\n");
  file = file.replace(/(function Legend\([^)]+\) \{\n)/, "$1  const { colors } = useTheme();\n");
  
  fs.writeFileSync(filename, file);
}

fix('app/net-worth.tsx');
fix('app/(tabs)/analysis.tsx');
console.log('Fixed pages.');
