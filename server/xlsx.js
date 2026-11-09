// Минимальный генератор XLSX: несколько листов, жирная шапка, ширина колонок, числа и даты.
import {zipSync, strToU8} from 'fflate';

const escXml = value => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

function columnName(index) {
  let name = '';
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

// Excel хранит даты как дни от 1899-12-30. Переводим в московское время.
function excelDate(date) {
  const ms = new Date(date).getTime() + 3 * 3600 * 1000;
  return ms / 86400000 + 25569;
}

function cellXml(value, ref, header) {
  if (value === null || value === undefined || value === '') return '';
  if (header) return `<c r="${ref}" t="inlineStr" s="1"><is><t>${escXml(value)}</t></is></c>`;
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `<c r="${ref}" s="2"><v>${excelDate(value)}</v></c>`;
  const textValue = String(value).slice(0, 32000);
  return `<c r="${ref}" t="inlineStr" s="3"><is><t xml:space="preserve">${escXml(textValue)}</t></is></c>`;
}

function sheetXml({columns, rows}) {
  const widths = columns.map(col => `<col min="${col.index + 1}" max="${col.index + 1}" width="${col.width || 16}" customWidth="1"/>`).join('');
  const header = `<row r="1">${columns.map((col, i) => cellXml(col.title, `${columnName(i)}1`, true)).join('')}</row>`;
  const body = rows.map((row, r) => `<row r="${r + 2}">${columns.map((col, i) => cellXml(row[col.key], `${columnName(i)}${r + 2}`, false)).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${header}${body}</sheetData>${rows.length ? `<autoFilter ref="A1:${columnName(columns.length - 1)}${rows.length + 1}"/>` : ''}</worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="dd.mm.yyyy hh:mm"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2E3DF"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>
</styleSheet>`;

// sheets: [{name, columns: [{key, title, width}], rows: [{...}]}]
export function buildXlsx(sheets) {
  const safeSheets = sheets.map((sheet, index) => ({
    ...sheet,
    name: String(sheet.name || `Лист${index + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31),
    columns: sheet.columns.map((col, i) => ({...col, index: i}))
  }));
  const files = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${safeSheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${safeSheets.map((s, i) => `<sheet name="${escXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${safeSheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${safeSheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(STYLES)
  };
  safeSheets.forEach((sheet, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(sheet)); });
  return zipSync(files, {level: 6});
}

export function toCsv(columns, rows) {
  const escape = value => {
    if (value === null || value === undefined) return '';
    const textValue = value instanceof Date ? value.toISOString() : String(value);
    return /[",\n;]/.test(textValue) ? `"${textValue.replace(/"/g, '""')}"` : textValue;
  };
  return [columns.map(col => escape(col.title)).join(','), ...rows.map(row => columns.map(col => escape(row[col.key])).join(','))].join('\n');
}
