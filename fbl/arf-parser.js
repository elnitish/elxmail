'use strict';

/**
 * ARF (Abuse Reporting Format) complaint parser.
 * Parses RFC 5965 formatted complaint emails to extract
 * the complainant's email address and reporting details.
 */

/**
 * Parse an ARF complaint report.
 *
 * @param {string} rawReport - Raw ARF report content
 * @returns {{ email: string|null, reportingDomain: string|null, feedbackType: string|null, originalHeaders: Object }}
 */
function parse(rawReport) {
  if (!rawReport || typeof rawReport !== 'string') {
    return { email: null, reportingDomain: null, feedbackType: null, originalHeaders: {} };
  }

  const result = {
    email: null,
    reportingDomain: null,
    feedbackType: null,
    arrivalDate: null,
    sourceIP: null,
    originalHeaders: {}
  };

  // Extract feedback type
  const feedbackMatch = rawReport.match(/Feedback-Type:\s*(.+)/i);
  if (feedbackMatch) result.feedbackType = feedbackMatch[1].trim();

  // Extract original recipient (the person who complained)
  const recipientMatch = rawReport.match(/Original-Rcpt-To:\s*(.+)/i)
    || rawReport.match(/Removal-Recipient:\s*(.+)/i);
  if (recipientMatch) result.email = recipientMatch[1].trim().toLowerCase();

  // Extract from the Original-Mail-From
  const fromMatch = rawReport.match(/Original-Mail-From:\s*(.+)/i);
  if (fromMatch) result.originalHeaders.from = fromMatch[1].trim();

  // Extract reporting domain
  const reportingMatch = rawReport.match(/Reported-Domain:\s*(.+)/i)
    || rawReport.match(/Reported-URI:\s*(.+)/i);
  if (reportingMatch) result.reportingDomain = reportingMatch[1].trim();

  // Extract arrival date
  const dateMatch = rawReport.match(/Arrival-Date:\s*(.+)/i);
  if (dateMatch) result.arrivalDate = dateMatch[1].trim();

  // Extract source IP
  const ipMatch = rawReport.match(/Source-IP:\s*(.+)/i);
  if (ipMatch) result.sourceIP = ipMatch[1].trim();

  // If we didn't find the email in ARF fields, try common headers
  if (!result.email) {
    const toMatch = rawReport.match(/^To:\s*(.+@.+)$/mi);
    if (toMatch) result.email = toMatch[1].trim().toLowerCase();
  }

  return result;
}

module.exports = { parse };
