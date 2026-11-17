// A clean, email-client-safe starting layout: table-based, inline CSS, 600px max,
// neutral colours, no images, no tracking pixels, no scripts.
// {{placeholders}} are filled (and HTML-escaped) by the server; [Brackets] are for the user to edit.

export const PROFESSIONAL_LAYOUT = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prospective Master's student: [Your Name]</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f5f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; background-color:#ffffff; border:1px solid #e3e5e8; border-radius:6px;">
        <tr>
          <td style="padding:20px 32px; border-bottom:1px solid #eceef1; font-family:Arial, Helvetica, sans-serif;">
            <div style="font-size:16px; font-weight:bold; color:#1f2933;">[Your Name]</div>
            <div style="font-size:13px; color:#6b7280; padding-top:2px;">Prospective Master's student &middot; [Your Field]</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#1f2933;">
            <p style="margin:0 0 16px;">Dear Professor {{name}},</p>
            <p style="margin:0 0 16px;">My name is [Your Name], and I am a [Degree] graduate from [Your University]. I am planning to apply for the Master's programme at {{university}} and am writing to ask whether you might have a place for a Master's student in your group.</p>
            <p style="margin:0 0 16px;">I have been following your work on {{researchFocus}} with great interest. {{whyFits}}</p>
            <p style="margin:0 0 16px;">My CV is linked below, and I would be grateful for any opportunity to discuss whether my background could be a good fit for your research.</p>
            <p style="margin:0 0 4px;">Thank you for your time and consideration.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 28px; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:1.5; color:#1f2933;">
            <p style="margin:0;">Kind regards,</p>
            <p style="margin:8px 0 0; font-weight:bold;">[Your Name]</p>
            <p style="margin:0; color:#6b7280;">[Degree], [Your University]</p>
            <p style="margin:0; color:#6b7280;">[Email] &middot; [Phone]</p>
            <p style="margin:0;"><a href="[LinkedIn / CV link]" style="color:#3b4bc8; text-decoration:underline;">[LinkedIn / CV link]</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
`;

export const MAX_HTML_UPLOAD_BYTES = 500 * 1024;

/** Text of the first <title> element, or null. */
export function extractHtmlTitle(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!m) return null;
  const t = m[1]
    .replace(/\s+/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&middot;/g, "·")
    .trim();
  return t || null;
}
