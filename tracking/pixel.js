'use strict';

/**
 * Open tracking via tracking pixel.
 * Injects a 1x1 transparent pixel image into HTML emails.
 * When the recipient opens the email and loads images, their
 * mail client fetches the pixel from the tracking server — recording the open.
 *
 * The pixel URL encodes the tracking ID so we know which email was opened.
 */

/**
 * Generate a tracking pixel HTML tag.
 *
 * @param {string} trackingDomain - Tracking server domain (e.g., 'track.myapp.com')
 * @param {string} trackingId - Unique email tracking ID
 * @returns {string} - HTML img tag
 */
function generatePixel(trackingDomain, trackingId) {
  const url = `https://${trackingDomain}/o/${trackingId}`;
  return `<img src="${url}" width="1" height="1" style="display:none;width:1px;height:1px;border:0;" alt="" />`;
}

/**
 * Inject tracking pixel into HTML email body.
 * Places it just before </body> or at the end if no body tag.
 *
 * @param {string} html - Email HTML body
 * @param {string} trackingDomain
 * @param {string} trackingId
 * @returns {string} - HTML with tracking pixel injected
 */
function injectPixel(html, trackingDomain, trackingId) {
  if (!html || !trackingDomain || !trackingId) return html;

  const pixel = generatePixel(trackingDomain, trackingId);

  if (html.includes('</body>')) {
    return html.replace('</body>', pixel + '</body>');
  }

  return html + pixel;
}

/**
 * Serve a 1x1 transparent GIF image.
 * Returns the raw bytes for use in an HTTP response.
 *
 * @returns {Buffer} - 1x1 transparent GIF
 */
function transparentPixelGIF() {
  // Smallest valid transparent GIF (43 bytes)
  return Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );
}

module.exports = { generatePixel, injectPixel, transparentPixelGIF };
