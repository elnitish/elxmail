'use strict';

/**
 * Real SMTP smoke test using Ethereal Email.
 *
 * Ethereal (https://ethereal.email) is a fake SMTP service from the
 * nodemailer team. It accepts real emails over SMTP but doesn't deliver
 * them anywhere — instead, it gives you a preview URL where you can
 * see exactly what your email would look like.
 *
 * This is the BEST way to verify elxmail works end-to-end with a real
 * SMTP server WITHOUT needing your own domain or risking deliverability.
 *
 * Run: node test/ethereal.js
 */

const nodemailer = require('nodemailer');
const elxmail = require('../index');

(async () => {
  console.log('Creating Ethereal test account...\n');

  // Create a fresh test account
  const account = await nodemailer.createTestAccount();
  console.log('Test account created:');
  console.log('  user:', account.user);
  console.log('  pass:', account.pass);
  console.log('  host:', account.smtp.host);
  console.log('  port:', account.smtp.port);
  console.log('');

  // Initialize elxmail with Ethereal as the SMTP transport
  elxmail.init({
    transports: [
      {
        type: 'smtp',
        domain: 'elxmail-test.dev',
        host: account.smtp.host,
        port: account.smtp.port,
        auth: { user: account.user, pass: account.pass }
      }
    ],
    rotation: { strategy: 'round-robin' },
    throttle: {
      perDomain: { max: 100, per: 'day' }
    },
    warmup: { enabled: false },
    dns: { autoValidate: false },
    logger: { level: 'info' }
  });

  // Listen for events
  const events = { sent: 0, bounced: 0, failed: 0 };
  elxmail.on('sent', (e) => {
    events.sent++;
    console.log(`✓ sent: ${e.to} (${e.messageId})`);
  });
  elxmail.on('bounced', (e) => {
    events.bounced++;
    console.log(`✗ bounced: ${e.email}`);
  });
  elxmail.on('failed', (e) => {
    events.failed++;
    console.log(`✗ failed: ${e.to} — ${e.error}`);
  });

  console.log('\n--- Test 1: Single email ---');
  const result1 = await elxmail.send({
    to: 'recipient1@example.com',
    subject: 'elxmail smoke test #1',
    body: '<h1>Hello from elxmail!</h1><p>This email was sent through the elxmail SDK to Ethereal Email.</p>',
    data: {}
  });
  console.log('Preview URL:', nodemailer.getTestMessageUrl(result1));

  console.log('\n--- Test 2: Template variables ---');
  const result2 = await elxmail.send({
    to: 'john@example.com',
    subject: 'Hi {{firstName}}, quick question',
    body: '<p>Hello {{firstName}} from {{company}},</p><p>I noticed your team is hiring.</p>',
    data: { firstName: 'John', company: 'Acme Corp' }
  });
  console.log('Preview URL:', nodemailer.getTestMessageUrl(result2));

  console.log('\n--- Test 3: Batch of 3 emails ---');
  const batchResult = await elxmail.sendBatch([
    { to: 'a@example.com', subject: 'Batch 1', body: '<p>Email 1</p>' },
    { to: 'b@example.com', subject: 'Batch 2', body: '<p>Email 2</p>' },
    { to: 'c@example.com', subject: 'Batch 3', body: '<p>Email 3</p>' }
  ]);
  console.log(`Batch result: ${batchResult.sent}/${batchResult.total} sent`);

  console.log('\n--- Test 4: Suppression check ---');
  elxmail.suppress.add('blocked@example.com', 'manual');
  const suppressed = await elxmail.send({
    to: 'blocked@example.com',
    subject: 'Should be suppressed',
    body: '<p>This should not send</p>'
  });
  console.log('Suppressed result:', suppressed);

  console.log('\n--- Test 5: Content scoring ---');
  const goodScore = elxmail.scoreContent({
    subject: 'Quick question about {{company}}',
    body: '<p>Hi {{name}}, hope you are doing well.</p>'
  });
  const badScore = elxmail.scoreContent({
    subject: 'FREE MONEY!!! ACT NOW!!!',
    body: '<p>CLICK HERE to BUY NOW! Limited time!!!</p>'
  });
  console.log(`Good email score: ${goodScore.score}/100`);
  console.log(`Spammy email score: ${badScore.score}/100`);

  console.log('\n--- Final Stats ---');
  await new Promise(r => setTimeout(r, 200)); // let analytics catch up
  const summary = elxmail.analytics.summary();
  console.log('Analytics:', JSON.stringify(summary, null, 2));
  console.log('Events captured:', events);

  console.log('\n✓ All smoke tests passed!');
  console.log('\nVisit https://ethereal.email and log in with the credentials above');
  console.log('to view all sent emails in the Ethereal inbox.');

  elxmail.shutdown();
  process.exit(0);
})().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
