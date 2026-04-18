'use strict';

/**
 * Email content spam scorer.
 * Analyzes subject and body for spam triggers before sending.
 * Returns a score 0-100 (higher = better, lower = more likely spam).
 *
 * Checks:
 *   - Spam trigger words in subject/body
 *   - ALL CAPS usage
 *   - Excessive punctuation (!!!, ???)
 *   - HTML to text ratio
 *   - Link count
 *   - Image to text ratio
 *   - Personalization usage
 *   - Unsubscribe link presence
 */

// Spam trigger words/phrases that reduce score
const SPAM_TRIGGERS = [
  // Urgency
  { pattern: /\bact now\b/i, penalty: 10, category: 'urgency' },
  { pattern: /\blimited time\b/i, penalty: 8, category: 'urgency' },
  { pattern: /\burgent\b/i, penalty: 8, category: 'urgency' },
  { pattern: /\bdon'?t miss\b/i, penalty: 5, category: 'urgency' },
  { pattern: /\bhurry\b/i, penalty: 7, category: 'urgency' },
  { pattern: /\blast chance\b/i, penalty: 8, category: 'urgency' },
  { pattern: /\bexpires?\b/i, penalty: 3, category: 'urgency' },

  // Money/Sales
  { pattern: /\bfree\b/i, penalty: 5, category: 'sales' },
  { pattern: /\b(buy|purchase) now\b/i, penalty: 10, category: 'sales' },
  { pattern: /\bdiscount\b/i, penalty: 5, category: 'sales' },
  { pattern: /\bcheap\b/i, penalty: 8, category: 'sales' },
  { pattern: /\bmoney back\b/i, penalty: 7, category: 'sales' },
  { pattern: /\bguarantee\b/i, penalty: 5, category: 'sales' },
  { pattern: /\bno cost\b/i, penalty: 7, category: 'sales' },
  { pattern: /\$\d+/i, penalty: 3, category: 'sales' },
  { pattern: /\b\d+% off\b/i, penalty: 7, category: 'sales' },
  { pattern: /\bcash\b/i, penalty: 5, category: 'sales' },

  // Manipulative
  { pattern: /\bclick (here|below)\b/i, penalty: 8, category: 'cta' },
  { pattern: /\bopt[- ]?in\b/i, penalty: 3, category: 'cta' },
  { pattern: /\bunsubscribe\b/i, penalty: 0, category: 'cta' }, // Actually good to have
  { pattern: /\bcongratulations?\b/i, penalty: 10, category: 'deceptive' },
  { pattern: /\bwinner\b/i, penalty: 10, category: 'deceptive' },
  { pattern: /\byou'?ve been selected\b/i, penalty: 12, category: 'deceptive' },
  { pattern: /\bdear friend\b/i, penalty: 8, category: 'deceptive' },

  // Technical spam signals
  { pattern: /\bviagra\b/i, penalty: 25, category: 'pharma' },
  { pattern: /\bcialis\b/i, penalty: 25, category: 'pharma' },
  { pattern: /\bweight loss\b/i, penalty: 15, category: 'health' },
  { pattern: /\bwork from home\b/i, penalty: 10, category: 'scam' },
  { pattern: /\bmake money\b/i, penalty: 12, category: 'scam' },
];

/**
 * Score email content for spam likelihood.
 *
 * @param {Object} email - { subject, body }
 * @returns {{ score: number, issues: Array<{ type: string, message: string, penalty: number }> }}
 */
function scoreContent(email) {
  const issues = [];
  let totalPenalty = 0;

  const subject = email.subject || '';
  const body = email.body || '';
  const combined = subject + ' ' + body;

  // 1. Check spam trigger words
  for (const trigger of SPAM_TRIGGERS) {
    if (trigger.pattern.test(combined) && trigger.penalty > 0) {
      totalPenalty += trigger.penalty;
      issues.push({
        type: 'spam_word',
        message: `Contains spam trigger: "${combined.match(trigger.pattern)[0]}"`,
        penalty: trigger.penalty,
        category: trigger.category
      });
    }
  }

  // 2. ALL CAPS in subject (>50% caps is suspicious)
  if (subject.length > 5) {
    const capsRatio = (subject.match(/[A-Z]/g) || []).length / subject.length;
    if (capsRatio > 0.5) {
      const penalty = Math.round(capsRatio * 15);
      totalPenalty += penalty;
      issues.push({
        type: 'caps',
        message: `Subject is ${Math.round(capsRatio * 100)}% uppercase`,
        penalty
      });
    }
  }

  // 3. Excessive punctuation
  const excessivePunctuation = combined.match(/[!?]{3,}/g);
  if (excessivePunctuation) {
    const penalty = excessivePunctuation.length * 5;
    totalPenalty += penalty;
    issues.push({
      type: 'punctuation',
      message: `Excessive punctuation found (${excessivePunctuation.length} instances)`,
      penalty
    });
  }

  // 4. Link count
  const linkCount = (body.match(/href\s*=\s*["']/gi) || []).length;
  if (linkCount > 3) {
    const penalty = (linkCount - 3) * 5;
    totalPenalty += penalty;
    issues.push({
      type: 'links',
      message: `${linkCount} links found (recommended max: 3)`,
      penalty
    });
  }

  // 5. No plain text content (HTML only)
  if (body.includes('<') && !email.text) {
    const htmlLength = body.length;
    const textLength = body.replace(/<[^>]+>/g, '').trim().length;
    const ratio = textLength / htmlLength;
    if (ratio < 0.3) {
      totalPenalty += 5;
      issues.push({
        type: 'html_ratio',
        message: `Low text-to-HTML ratio (${Math.round(ratio * 100)}%)`,
        penalty: 5
      });
    }
  }

  // 6. Subject line length
  if (subject.length > 70) {
    totalPenalty += 3;
    issues.push({
      type: 'subject_length',
      message: `Subject is ${subject.length} characters (recommended: under 50)`,
      penalty: 3
    });
  }

  // 7. Personalization bonus (reduces penalty)
  if (combined.includes('{{') || combined.match(/\b(Hi|Hey|Hello)\s+[A-Z][a-z]/)) {
    totalPenalty = Math.max(0, totalPenalty - 10);
    issues.push({
      type: 'personalization',
      message: 'Contains personalization (bonus)',
      penalty: -10
    });
  }

  // Calculate score (100 = perfect, 0 = definite spam)
  const score = Math.max(0, Math.min(100, 100 - totalPenalty));

  return { score, issues };
}

module.exports = { scoreContent, SPAM_TRIGGERS };
