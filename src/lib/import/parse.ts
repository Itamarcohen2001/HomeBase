import { ImportError, type Matrix, type ParseResult, findRow, norm } from './shared';
import { parseCal } from './cal';
import { parsePoalim } from './poalim';
import { parseGeneric } from './generic';

/**
 * SheetJS נטען דינמית כדי שלא ייכנס ל-bundle הראשי — הוא נדרש רק במסך הייבוא.
 */
async function readWorkbook(data: ArrayBuffer): Promise<{ name: string; rows: Matrix }[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(new Uint8Array(data), { type: 'array', cellDates: true });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    if (!ws || !ws['!ref']) return { name, rows: [] as Matrix };
    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    }) as Matrix;
    return { name, rows };
  });
}

function isCalSheet(sheet: { name: string; rows: Matrix }): boolean {
  if (!sheet.rows.length) return false;
  if (norm(sheet.name).toLowerCase() === 'activities') return true;
  return findRow(sheet.rows, (cells) => cells.includes('תאריך עסקה') && cells.some((c) => c.startsWith('שם'))) >= 0;
}

function isPoalimSheet(sheet: { name: string; rows: Matrix }): boolean {
  return findRow(sheet.rows, (cells) => cells[0] === 'פירוט עבור הכרטיסים בארץ') >= 0;
}

export type ImportFile = {
  name: string;
  data: ArrayBuffer;
};

export async function parseFile(file: ImportFile): Promise<ParseResult> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (!['xls', 'xlsx', 'csv'].includes(ext)) {
    throw new ImportError('פורמט לא נתמך. אפשר להעלות קבצי Excel‏ (xlsx / xls) או CSV.');
  }
  if (!file.data.byteLength) throw new ImportError('הקובץ ריק');

  const sheets = await readWorkbook(file.data);
  const withRows = sheets.filter((s) => s.rows.length);
  if (!withRows.length) throw new ImportError('הקובץ לא מכיל נתונים');

  const poalim = withRows.find(isPoalimSheet);
  if (poalim) return parsePoalim(poalim.rows);

  const cal = withRows.find(isCalSheet);
  if (cal) return parseCal(cal.rows);

  // גיליון עם הכי הרבה שורות הוא כמעט תמיד הגיליון האמיתי
  const biggest = withRows.reduce((a, b) => (b.rows.length > a.rows.length ? b : a));
  return parseGeneric(biggest.rows, ext === 'csv' ? 'קובץ CSV' : 'קובץ Excel');
}

export * from './shared';
export { parseCal } from './cal';
export { parsePoalim } from './poalim';
export { parseGeneric } from './generic';
