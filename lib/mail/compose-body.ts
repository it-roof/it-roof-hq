/** Shared outgoing-mail body construction so UI preview matches SMTP. */

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<img[^>]+alt=["']([^"']*)["'][^>]*>/gi, '[$1]')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function signatureBlockHtml(signatureHtml: string | null | undefined): string {
  const sig = signatureHtml?.trim();
  if (!sig) return '';
  return `<div style="margin-top: 1em;">${sig}</div>`;
}

export function buildOutgoingBodies(opts: {
  text: string;
  isHtml?: boolean;
  signatureHtml?: string | null;
}): { html: string | undefined; text: string } {
  const body = opts.text ?? '';
  if (opts.isHtml) {
    const html = body + signatureBlockHtml(opts.signatureHtml);
    return { html, text: htmlToPlainText(html) };
  }
  const sigPlain = opts.signatureHtml?.trim()
    ? '\n\n' + htmlToPlainText(opts.signatureHtml)
    : '';
  return { html: undefined, text: body + sigPlain };
}

/** HTML document used by the compose preview (body + signature, as sent). */
export function previewOutgoingHtml(opts: {
  text: string;
  isHtml?: boolean;
  signatureHtml?: string | null;
}): string {
  const built = buildOutgoingBodies(opts);
  if (built.html) return built.html;
  const escaped = built.text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<pre style="white-space:pre-wrap;font:14px/1.45 sans-serif;margin:0">${escaped}</pre>`;
}
