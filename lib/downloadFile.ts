import { api } from './api';
import { env } from './env';

// Authenticated file download — a plain <a href> can't carry the Bearer
// token, so this fetches the PDF as a blob through the same axios
// instance (which already attaches auth headers) and triggers a save via
// a temporary object URL.
export async function downloadFile(path: string, filename: string): Promise<void> {
  const res = await api.get(`${env.API_URL}${path}`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// Prints the exact same PDF the download button saves — fetches it as a
// blob (same auth-carrying axios instance) and opens it in a new tab using
// Chrome/Edge/Safari's built-in PDF viewer, which has its own print button.
// This guarantees the printed copy (what a shop staples into the medicine
// package) and the downloaded copy are always byte-identical, never two
// differently-styled documents.
//
// Deliberately does NOT auto-call `.print()` on a hidden iframe: the
// embedded PDF viewer renders asynchronously after the iframe's `load`
// event fires, so an immediate print() call races it and can print the
// blank iframe shell (with the browser's default page header/footer)
// instead of the PDF. Opening a real tab and letting the user hit the
// viewer's own print button (or Ctrl/Cmd+P) is slower by one click but
// never misfires.
export async function printFile(path: string): Promise<void> {
  const res = await api.get(`${env.API_URL}${path}`, { responseType: 'blob' });
  const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  const win = window.open(blobUrl, '_blank');
  if (!win) {
    window.URL.revokeObjectURL(blobUrl);
    throw new Error('Pop-up blocked — allow pop-ups for this site to print.');
  }
  setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60000);
}
