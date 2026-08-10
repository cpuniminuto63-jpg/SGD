import * as XLSX from "xlsx";

/** Lee un archivo .xlsx en el navegador y devuelve las filas de una hoja como array de arrays. */
export async function readWorkbookRows(file: File, sheetName?: string): Promise<unknown[][]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[sheetName ?? workbook.SheetNames[0]];
  if (!sheet) throw new Error(`No se encontró la hoja "${sheetName ?? workbook.SheetNames[0]}" en el archivo.`);
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" }) as unknown[][];
}
