'use strict';

/**
 * Click tracking via link rewriting.
 * Replaces every link in the email with a redirect URL pointing to
 * the tracking server. When clicked, the server logs the click
 * and redirects to the actual URL.
 */

/**
 * Rewrite all links in HTML to redirect through the tracking domain.
 *
 * <a href="https://example.com">Click</a>
 *   becomes
 * <a href="https://track.myapp.com/c/trackingId/base64url">Click</a>
 *
 * @param {string} html - Email HTML body
 * @param {string} trackingDomain - Tracking server domain
 * @param {string} trackingId - Unique email tracking ID
 * @returns {{ html: string, links: Array<{ original: string, tracking: string }> }}
 */
function rewriteLinks(html, trackingDomain, trackingId) {
  if (!html || !trackingDomain || !trackingId) return { html, links: [] };

  const links = [];

  // Match href attributes in anchor tags
  const rewritten = html.replace(
    /<a\s([^>]*?)href="(https?:\/\/[^"]+)"([^>]*?)>/gi,
    (match, before, url, after) => {
      // Don't rewrite unsubscribe links or tracking domain links
      if (url.includes(trackingDomain) || url.includes('unsubscribe')) {
        return match;
      }

      const encoded = Buffer.from(url).toString('base64url');
      const trackingUrl = `https://${trackingDomain}/c/${trackingId}/${encoded}`;

      links.push({ original: url, tracking: trackingUrl });
      return `<a ${before}href="${trackingUrl}"${after}>`;
    }
  );

  return { html: rewritten, links };
}

/**
 * Decode a tracking URL back to the original.
 * @param {string} encoded - Base64url encoded original URL
 * @returns {string} - Original URL
 */
function decodeTrackingUrl(encoded) {
  return Buffer.from(encoded, 'base64url').toString('utf8');
}

module.exports = { rewriteLinks, decodeTrackingUrl };
