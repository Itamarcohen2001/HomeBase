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

// 3. Add to PageHeader ONLY
// The exact structure in PageHeader is:
// export function PageHeader({ ... }) {
// ...
//       <Text style={[font.h2, rtlText, { flexShrink: 1, color: colors.text }]}>{title}</Text>
//     </View>
//     {action}
//   </View>

// We can just use a precise replace for PageHeader:
index = index.replace(
  /(export function PageHeader\([\s\S]*?<Text style=\{(.*?)\}>\{title\}<\/Text>\s*<\/View>\s*)\{action\}(\s*<\/View>)/,
  `$1<View style={{ flexDirection: 'row-reverse', gap: 12, alignItems: 'center' }}>{action}<GlobalHeaderActions /></View>$3`
);

fs.writeFileSync('src/ui/index.tsx', index);
console.log("Header added successfully to PageHeader only.");
