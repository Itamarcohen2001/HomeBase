const fs = require('fs');

function fix(filename) {
  let file = fs.readFileSync(filename, 'utf8');
  
  if (!file.includes('GlobalHeaderActions')) {
    file = file.replace(/import \{([\s\S]*?)\} from '\.\.\/\.\.\/src\/ui';/, "import { $1, GlobalHeaderActions } from '../../src/ui';");
    file = file.replace(
      /<H2 style=\{\{ marginBottom: spacing\.md \}\}>([^<]+)<\/H2>/,
      `<View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: spacing.md, alignItems: 'center' }}>\n        <H2>$1</H2>\n        <GlobalHeaderActions />\n      </View>`
    );
  }
  
  file = file.replace(/,\s*, GlobalHeaderActions/g, ',\n  GlobalHeaderActions');
  
  fs.writeFileSync(filename, file);
}

fix('app/(tabs)/history.tsx');
fix('app/(tabs)/analysis.tsx');
fix('app/(tabs)/more.tsx');
console.log('Fixed commas.');
