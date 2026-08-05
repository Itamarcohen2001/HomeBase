const fs = require('fs');
let importCode = fs.readFileSync('app/import.tsx', 'utf8');
importCode = importCode.replace(
  /<Text testID={`hb-import-note-\$\{i\}`}>{note}<\/Text>/g,
  '<Text style={{ color: colors.text }} testID={`hb-import-note-${i}`}>{note}</Text>'
);
importCode = importCode.replace(
  /<Text testID="hb-import-duplicates">/g,
  '<Text style={{ color: colors.text }} testID="hb-import-duplicates">'
);
importCode = importCode.replace(
  /<Text testID="hb-import-refunds">/g,
  '<Text style={{ color: colors.text }} testID="hb-import-refunds">'
);
importCode = importCode.replace(
  /<Text testID="hb-import-recurring-summary">/g,
  '<Text style={{ color: colors.text }} testID="hb-import-recurring-summary">'
);
importCode = importCode.replace(
  /<Text testID=\{testID\} style=\{\[font\.body, rtlText, \{ fontWeight: '700' \}\]\}>/g,
  "<Text testID={testID} style={[font.body, rtlText, { fontWeight: '700', color: colors.text }]}>"
);
fs.writeFileSync('app/import.tsx', importCode);
