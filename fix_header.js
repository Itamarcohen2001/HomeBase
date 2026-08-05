const fs = require('fs');

let index = fs.readFileSync('src/ui/index.tsx', 'utf8');

// 1. Add useRouter to expo-router import if needed
if (!index.includes('useRouter')) {
  if (index.includes(`from 'expo-router'`)) {
    index = index.replace(/import \{([^}]+)\} from 'expo-router';/, "import {$1, useRouter } from 'expo-router';");
  } else {
    index = `import { useRouter } from 'expo-router';\n` + index;
  }
}

// 2. Add GlobalHeaderActions
const globalHeaderCode = `
export function GlobalHeaderActions() {
  const { colors, toggleTheme, isDark } = useTheme();
  const router = useRouter();
  
  return (
    <View style={{ flexDirection: 'row-reverse', gap: spacing.md }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="החלף עיצוב"
        onPress={toggleTheme}
        hitSlop={10}
      >
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={isDark ? 'sunny' : 'moon'} size={20} color={colors.primary} />
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="החשבון שלי"
        onPress={() => router.push('/(tabs)/more')}
        hitSlop={10}
      >
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="person" size={20} color={colors.primary} />
        </View>
      </Pressable>
    </View>
  );
}
`;

if (!index.includes('GlobalHeaderActions')) {
  index += '\n' + globalHeaderCode;
}

// 3. Add to PageHeader
index = index.replace(
  /(\{\s*action\s*\})/g,
  `<View style={{ flexDirection: 'row-reverse', gap: 12, alignItems: 'center' }}>$1<GlobalHeaderActions /></View>`
);
// Fix the replacement that happens twice if we run it twice, but we run it once.
// Wait, `{action}` is in `PageHeader` return statement: `      {action}`
// Let's make it safe:
index = index.replace(
  /      \{action\}\n    <\/View>/,
  `      <View style={{ flexDirection: 'row-reverse', gap: 12, alignItems: 'center' }}>{action}<GlobalHeaderActions /></View>\n    </View>`
);

fs.writeFileSync('src/ui/index.tsx', index);

// Now patch tabs
function patchTab(filename) {
  let file = fs.readFileSync(filename, 'utf8');
  if (!file.includes('GlobalHeaderActions')) {
    file = file.replace(/import \{([^}]+)\} from '\.\.\/\.\.\/src\/ui';/, "import { $1, GlobalHeaderActions } from '../../src/ui';");
  }
  
  // replace <H2 style={{ marginBottom: spacing.md }}>X</H2>
  // with a View row
  file = file.replace(
    /<H2 style=\{\{ marginBottom: spacing\.md \}\}>([^<]+)<\/H2>/,
    `<View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: spacing.md, alignItems: 'center' }}>\n        <H2>$1</H2>\n        <GlobalHeaderActions />\n      </View>`
  );
  fs.writeFileSync(filename, file);
}

patchTab('app/(tabs)/history.tsx');
patchTab('app/(tabs)/analysis.tsx');
patchTab('app/(tabs)/more.tsx');

// For index.tsx (Home tab), it already has the two buttons manually!
let home = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');
if (!home.includes('GlobalHeaderActions')) {
  home = home.replace(/import \{([^}]+)\} from '\.\.\/\.\.\/src\/ui';/, "import { $1, GlobalHeaderActions } from '../../src/ui';");
}
home = home.replace(
  /<View style=\{\{ \.\.\.rtlRow, gap: spacing\.md \}\}>[\s\S]*?<\/View>/,
  `<GlobalHeaderActions />`
);
fs.writeFileSync('app/(tabs)/index.tsx', home);

console.log("Global buttons added to all screens!");
