const { Project, SyntaxKind } = require('ts-morph');

const project = new Project();
const sourceFile = project.addSourceFileAtPath('src/ui/index.tsx');

// 1. Add useTheme import
if (!sourceFile.getImportDeclaration(imp => imp.getModuleSpecifierValue() === '../context/ThemeContext')) {
  sourceFile.addImportDeclaration({
    namedImports: ['useTheme'],
    moduleSpecifier: '../context/ThemeContext',
  });
}

// 2. Remove 'colors' from '../theme' import
const themeImport = sourceFile.getImportDeclaration(imp => imp.getModuleSpecifierValue() === '../theme');
if (themeImport) {
  const namedImports = themeImport.getNamedImports();
  const colorsImport = namedImports.find(ni => ni.getName() === 'colors');
  if (colorsImport) {
    colorsImport.remove();
  }
}

// 3. Convert `const s = StyleSheet.create(...)` to `const useStyles = (colors: any) => StyleSheet.create(...)`
const sVar = sourceFile.getVariableStatement(v => v.getDeclarations().some(d => d.getName() === 's'));
if (sVar) {
  const init = sVar.getDeclarations()[0].getInitializer().getText();
  sVar.replaceWithText(`const useStyles = (colors: any) => ${init};`);
}

// 4. Inject hooks into all exported components
const components = [];
sourceFile.getFunctions().forEach(f => {
  if (f.isExported() && f.getName() && /^[A-Z]/.test(f.getName())) {
    components.push(f);
  }
});
sourceFile.getVariableStatements().forEach(v => {
  if (v.isExported()) {
    v.getDeclarations().forEach(d => {
      if (/^[A-Z]/.test(d.getName()) && d.getInitializer() && d.getInitializer().getKind() === SyntaxKind.ArrowFunction) {
        components.push(d.getInitializer());
      }
    });
  }
});

components.forEach(comp => {
  const body = comp.getBody();
  if (body && body.getKind() === SyntaxKind.Block) {
    const bodyText = body.getText();
    if (!bodyText.includes('useTheme(')) {
      body.insertStatements(0, 'const { colors } = useTheme();');
    }
    if (bodyText.includes('s.') && !bodyText.includes('useStyles(')) {
      body.insertStatements(1, 'const s = useStyles(colors);');
    }
  } else if (comp.getKind() === SyntaxKind.ArrowFunction) {
    // Convert implicit return to block
    const expr = comp.getBody().getText();
    const newBody = `{\n  const { colors } = useTheme();\n  const s = useStyles(colors);\n  return ${expr};\n}`;
    comp.setBodyText(newBody);
  }
});

// 5. Fix default arguments that use `colors.`
components.forEach(comp => {
  comp.getParameters().forEach(p => {
    const init = p.getInitializer();
    if (init && init.getText().includes('colors.')) {
      const type = p.getTypeNode() ? p.getTypeNode().getText() : 'any';
      const name = p.getName();
      const defaultVal = init.getText();
      p.removeInitializer();
      // Add inside body
      const body = comp.getBody();
      if (body && body.getKind() === SyntaxKind.Block) {
        // Just inject after hooks
        body.insertStatements(2, `if (${name} === undefined) ${name} = ${defaultVal};`);
      }
    }
  });
});

project.saveSync();
console.log('Refactoring complete.');
