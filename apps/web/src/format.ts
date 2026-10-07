/** YYYY-MM-DD → DD-MM-YYYY, the date format used throughout the UI. */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}-${month}-${year}`;
}
