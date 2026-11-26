export function catalogMessage(failed: boolean, total: number, visible: number): string | null {
  if (failed) return 'Beats could not be loaded. Please try again later.';
  if (total === 0) return 'No beats published yet.';
  if (visible === 0) return 'No beats match these filters yet.';
  return null;
}
