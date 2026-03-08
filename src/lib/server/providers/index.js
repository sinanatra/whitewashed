import { pushToSeatable } from './seatable';
import { pushToGoogleSheets } from './google-sheets';

export async function pushToRemoteProviders(record) {
  const tasks = [pushToSeatable(record), pushToGoogleSheets(record)];
  const settled = await Promise.allSettled(tasks);

  const warnings = [];

  for (const item of settled) {
    if (item.status === 'rejected') {
      warnings.push(item.reason?.message || 'Errore provider remoto');
    }
  }

  return warnings;
}
