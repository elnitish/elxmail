'use strict';

const { generateMessageId, generateTrackingId } = require('../utils/crypto');
const { render } = require('../utils/template');

/**
 * MIME message composer.
 * Takes the developer's simple { to, from, subject, body } input
 * and builds a proper RFC 2045 compliant MIME message.
 *
 * Handles:
 * - Message-ID, Date, MIME-Version headers
 * - Multipart/alternative (HTML + auto-generated plain text)
 * - Template variable replacement
 * - Required headers injection (List-Unsubscribe, Precedence)
 * - Tracking pixel injection (when tracking is enabled)
 */

/**
 * Compose a complete email message object.
 *
 * @param {Object} email - Developer's email input
 * @param {string} email.to - Recipient email
 * @param {string} email.from - Sender email (optional, auto-set from transport domain)
 * @param {string} email.subject - Email subject
 * @param {string} email.body - Email body (HTML or plain text)
 * @param {string} [email.text] - Plain text version (auto-generated if not provided)
 * @param {Object} [email.data] - Template variables { firstName: 'John', company: 'Acme' }
 * @param {Object} [email.headers] - Custom headers to add
 * @param {string} [email.replyTo] - Reply-To address
 * @param {Object} transport - The transport config (domain, auth, etc.)
 * @param {Object} [options] - Composition options
 * @param {Object} [options.content] - Content config from store
 * @param {Object} [options.tracking] - Tracking config from store
 * @returns {Object} - Composed message ready for SMTP
 */
function compose(email, transport, options = {}) {
  const { content = {}, tracking = {} } = options;

  const domain = transport.domain;
  const fromAddress = email.from || `noreply@${domain}`;
  const trackingId = generateTrackingId();

  // Apply template variables to subject and body
  const subject = email.data ? render(email.subject, email.data) : email.subject;
  let html = email.data ? render(email.body, email.data) : email.body;
  let text = email.text || (content.autoPlainText !== false ? stripHtml(html) : null);

  // Inject tracking pixel if enabled
  if (tracking.enabled && tracking.opens && tracking.domain) {
    const pixel = `<img src="https://${tracking.domain}/o/${trackingId}" width="1" height="1" style="display:none" alt="" />`;
    html = injectTrackingPixel(html, pixel);
  }

  // Build headers
  const headers = {
    'Message-ID': generateMessageId(domain),
    'X-Elxmail-ID': trackingId,
    ...(email.headers || {})
  };

  // Inject required headers from content config
  if (content.requiredHeaders && Array.isArray(content.requiredHeaders)) {
    for (const header of content.requiredHeaders) {
      if (header.includes(':')) {
        const [key, ...val] = header.split(':');
        headers[key.trim()] = val.join(':').trim();
      } else if (header === 'List-Unsubscribe' && tracking.unsubscribe?.enabled && tracking.unsubscribe?.url) {
        const unsubUrl = render(tracking.unsubscribe.url, { emailId: trackingId });
        headers['List-Unsubscribe'] = `<${unsubUrl}>`;
        headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
      }
    }
  }

  const message = {
    from: fromAddress,
    to: email.to,
    subject,
    html,
    headers,
    _trackingId: trackingId,
    _domain: domain
  };

  if (text) {
    message.text = text;
  }

  if (email.replyTo) {
    message.replyTo = email.replyTo;
  }

  return message;
}

/**
 * Strip HTML tags to produce plain text version.
 * Simple but effective — handles common email HTML patterns.
 */
function stripHtml(html) {
  if (!html) return '';
  return html
    // Replace <br>, <br/>, <br /> with newlines
    .replace(/<br\s*\/?>/gi, '\n')
    // Replace </p>, </div>, </li> with newlines
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    // Replace <a href="url">text</a> with text (url)
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    // Strip remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Collapse multiple newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Inject a tracking pixel before </body> or at the end of HTML.
 */
function injectTrackingPixel(html, pixel) {
  if (html.includes('</body>')) {
    return html.replace('</body>', pixel + '</body>');
  }
  return html + pixel;
}

module.exports = { compose, stripHtml };
