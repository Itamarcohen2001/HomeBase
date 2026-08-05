const { Project, SyntaxKind } = require('ts-morph');
const fs = require('fs');

// First, fix Arrow functions with Regex
let uiCode = fs.readFileSync('src/ui/index.tsx', 'utf8');
const helpers = ['H1', 'H2', 'H3', 'Body', 'Muted'];
helpers.forEach(h => {
  const isMuted = h === 'Muted';
  const colorProp = isMuted ? 'colors.textMuted' : 'colors.text';
  const regex = new RegExp(`(export const ${h} = \\(p: TextProps\\) => )\\(\\s*<Text([^>]+)style=\\{\\[(.*?), rtlText, p\\.style\\]\\}>([\\s\\S]*?)<\\/Text>\\s*\\);`);
  uiCode = uiCode.replace(regex, `$1{\n  const { colors } = useTheme();\n  return (\n    <Text$2style={[$3, { color: ${colorProp} }, rtlText, p.style]}>$4</Text>\n  );\n};`);
});

// Also fix PageHeader directly using Regex because it's so simple
uiCode = uiCode.replace(/<Text style=\{\[font\.h2, rtlText, \{ flexShrink: 1 \}\]\}>\{title\}<\/Text>/, 
  '<Text style={[font.h2, rtlText, { flexShrink: 1, color: colors.text }]}>{title}</Text>');

fs.writeFileSync('src/ui/index.tsx', uiCode);

// Now use ts-morph for the rest
const project = new Project();
const sourceFile = project.addSourceFileAtPath('src/ui/index.tsx');

if (!sourceFile.getImportDeclaration(imp => imp.getModuleSpecifierValue() === '../context/ThemeContext')) {
  sourceFile.addImportDeclaration({
    namedImports: ['useTheme'],
    moduleSpecifier: '../context/ThemeContext',
  });
}

const themeImport = sourceFile.getImportDeclaration(imp => imp.getModuleSpecifierValue() === '../theme');
if (themeImport) {
  const colorsImport = themeImport.getNamedImports().find(ni => ni.getName() === 'colors');
  if (colorsImport) colorsImport.remove();
}

const sVar = sourceFile.getVariableStatement(v => v.getDeclarations().some(d => d.getName() === 's'));
if (sVar && !sVar.getText().includes('useStyles')) {
  const init = sVar.getDeclarations()[0].getInitializer().getText();
  sVar.replaceWithText(`const useStyles = (colors: any) => ${init};`);
}

sourceFile.getFunctions().forEach(f => {
  if (f.isExported() && f.getName() && /^[A-Z]/.test(f.getName())) {
    const body = f.getBody();
    if (body && body.getKind() === SyntaxKind.Block) {
      const bodyText = body.getText();
      if (!bodyText.includes('useTheme()')) {
        body.insertStatements(0, 'const { colors } = useTheme();');
      }
      if (bodyText.includes('s.') && !bodyText.includes('useStyles(')) {
        body.insertStatements(1, 'const s = useStyles(colors);');
      }
      
      // Fix default args
      f.getParameters().forEach(p => {
        const init = p.getInitializer();
        if (init && init.getText().includes('colors.')) {
          const name = p.getName();
          const defaultVal = init.getText();
          p.removeInitializer();
          body.insertStatements(2, `if (${name} === undefined) ${name} = ${defaultVal};`);
        }
      });
    }
  }
});

project.saveSync();
console.log('UI Refactor complete.');
