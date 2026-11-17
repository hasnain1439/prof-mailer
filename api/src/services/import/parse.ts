import Papa from "papaparse";
import * as XLSX from "xlsx";

/** Pure file parsing for the import feature (no DB, no env). */

export const IMPORT_COLUMNS = [
  "name",
  "email",
  "university",
  "country",
  "researchFocus",
  "whyFits",
  "profileUrl",
  "subject",
  "body",
  "scheduledAt",
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];
export type ImportRowData = Record<ImportColumn, string>;

export interface ParsedRow {
  /** 1-based spreadsheet row (header = 1, first data row = 2). */
  rowNumber: number;
  data: ImportRowData;
}

export const REQUIRED_COLUMNS: readonly ImportColumn[] = ["name", "email", "university", "scheduledAt"];
export const MAX_IMPORT_ROWS = 2000;

/** Thrown for problems with the file as a whole (route maps it to 400). */
export class ImportParseError extends Error {}

/** Lowercased, separator-free header key → canonical column name. */
const HEADER_MAP: Record<string, ImportColumn> = Object.fromEntries(
  IMPORT_COLUMNS.map((c) => [c.toLowerCase(), c]),
) as Record<string, ImportColumn>;

/** Map a raw header cell to a canonical column (case-insensitive; ignores spaces, `_`, `-`). */
export function canonicalHeader(raw: string): ImportColumn | null {
  const key = raw.replace(/^﻿/, "").trim().toLowerCase().replace(/[\s_\-]+/g, "");
  return HEADER_MAP[key] ?? null;
}

export function emptyRowData(): ImportRowData {
  return Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, ""])) as ImportRowData;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Excel serial date → "YYYY-MM-DD HH:mm". The serial encodes wall-clock components
 * (no timezone), which we treat as Karachi local time. Rounded to the nearest minute.
 */
export function excelSerialToLocalString(serial: number, date1904 = false): string {
  const days = serial + (date1904 ? 1462 : 0);
  const ms = Math.round((days * 86_400_000) / 60_000) * 60_000;
  const d = new Date(Date.UTC(1899, 11, 30) + ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** JS Date (from a spreadsheet lib, built from local components) → its wall-clock string. */
function dateToLocalString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function cellToString(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : dateToLocalString(v);
  return String(v).replace(/^﻿/, "").trim();
}

/** Turn a header row + data rows (arrays) into ParsedRows. `firstRowNumber` is the header's 1-based row. */
function rowsFromMatrix(
  matrix: unknown[][],
  firstRowNumber: number,
  scheduledAtCell: (v: unknown) => string,
): ParsedRow[] {
  // Header = first non-empty row.
  const headerIdx = matrix.findIndex((r) => r.some((c) => cellToString(c) !== ""));
  if (headerIdx === -1) throw new ImportParseError("The file is empty");
  const header = matrix[headerIdx]!;
  const colMap: (ImportColumn | null)[] = header.map((h) => canonicalHeader(cellToString(h)));

  const present = new Set(colMap.filter((c): c is ImportColumn => c !== null));
  const missing = REQUIRED_COLUMNS.filter((c) => !present.has(c));
  if (missing.length) {
    throw new ImportParseError(
      `Missing required column(s): ${missing.join(", ")}. Expected header: ${IMPORT_COLUMNS.join(", ")}`,
    );
  }

  const out: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const cells = matrix[i]!;
    if (!cells.some((c) => cellToString(c) !== "")) continue; // blank line
    const data = emptyRowData();
    colMap.forEach((col, j) => {
      if (!col) return;
      const v = cells[j];
      // First occurrence of a column wins if a header is duplicated.
      if (data[col] !== "") return;
      data[col] = col === "scheduledAt" ? scheduledAtCell(v) : cellToString(v);
    });
    out.push({ rowNumber: firstRowNumber + i, data });
  }
  if (out.length === 0) throw new ImportParseError("The file has no data rows");
  if (out.length > MAX_IMPORT_ROWS) {
    throw new ImportParseError(`Too many rows (${out.length}); the maximum is ${MAX_IMPORT_ROWS}`);
  }
  return out;
}

export function parseCsv(text: string): ParsedRow[] {
  const clean = text.replace(/^﻿/, "");
  // Parse as arrays (not header:true) so row numbers stay aligned with the file even with blank lines.
  const res = Papa.parse<string[]>(clean, { header: false, skipEmptyLines: false });
  const fatal = res.errors.find((e) => e.type === "Quotes");
  if (fatal) throw new ImportParseError(`CSV parse error near row ${(fatal.row ?? 0) + 1}: ${fatal.message}`);
  return rowsFromMatrix(res.data, 1, cellToString);
}

export function parseXlsx(buf: Buffer): ParsedRow[] {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "buffer" });
  } catch {
    throw new ImportParseError("Could not read the spreadsheet");
  }
  const sheetName = wb.SheetNames[0];
  const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
  if (!sheet || !sheet["!ref"]) throw new ImportParseError("The spreadsheet is empty");
  const date1904 = Boolean(wb.Workbook?.WBProps?.date1904);
  const startRow = XLSX.utils.decode_range(sheet["!ref"]).s.r; // 0-based
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
    blankrows: true,
  });
  const scheduledAtCell = (v: unknown): string => {
    if (typeof v === "number" && Number.isFinite(v)) return excelSerialToLocalString(v, date1904);
    return cellToString(v);
  };
  return rowsFromMatrix(matrix, startRow + 1, scheduledAtCell);
}

/** Parse an uploaded file (by extension) into rows. Throws ImportParseError. */
export function parseImportFile(buf: Buffer, filename: string): ParsedRow[] {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "csv") return parseCsv(buf.toString("utf8"));
  if (ext === "xlsx") return parseXlsx(buf);
  throw new ImportParseError("Unsupported file type; upload a .csv or .xlsx file");
}
