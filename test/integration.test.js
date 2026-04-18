'use strict';

/**
 * End-to-end integration tests.
 * Uses MockSMTPServer to test the full elxmail pipeline:
 *   init() → send() → SMTP transport → bounce handling → analytics → events
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { MockSMTPServer } = require('./mocks/smtp-server');

const TEST_PORT = 12525;

describe('integration: full send pipeline', () => {
  let mockServer;
  let elxmail;

  before(async () => {
    mockServer = new MockSMTPServer({ port: TEST_PORT, authRequired: false });
    await mockServer.start();
  });

  after(async () => {
    await mockServer.stop();
  });

  beforeEach(() => {
    // Fresh instance each test
    delete require.cache[require.resolve('../index')];
    elxmail = require('../index');
    mockServer.clearMessages();
  });

  it('init() returns ready status', () => {
    const status = elxmail.init({
      transports: [
        { type: 'smtp', domain: 'test.com', host: '127.0.0.1', port: TEST_PORT, auth: { user: 'x', pass: 'x' } }
      ],
      logger: { level: 'error', output: 'console' },
      dns: { autoValidate: false }
    });

    assert.equal(status.status, 'ready');
    assert.equal(status.transports, 1);
    elxmail.shutdown();
  });

  it('sends a single email through the full pipeline', async () => {
    elxmail.init({
      transports: [
        { type: 'smtp', domain: 'test.com', host: '127.0.0.1', port: TEST_PORT, auth: { user: 'x', pass: 'x' } }
      ],
      logger: { level: 'error', output: 'console' },
      dns: { autoValidate: false },
      warmup: { enabled: false }
    });

    const result = await elxmail.send({
      to: 'recipient@example.com',
      subject: 'Integration test',
      body: '<p>Hello from elxmail integration test</p>'
    });

    assert.equal(result.success, true);
    assert.ok(result.messageId);
    assert.equal(mockServer.getMessages().length, 1);

    const received = mockServer.getMessages()[0];
    assert.deepEqual(received.to, ['recipient@example.com']);
    assert.ok(received.content.includes('Integration test'));
    assert.ok(received.content.includes('Hello from elxmail'));

    elxmail.shutdown();
  });

  it('emits sent event after delivery', async () => {
    elxmail.init({
      transports: [
        { type: 'smtp', domain: 'test.com', host: '127.0.0.1', port: TEST_PORT, auth: { user: 'x', pass: 'x' } }
      ],
      logger: { level: 'error' },
      dns: { autoValidate: false },
      warmup: { enabled: false }
    });

    let sentEvent = null;
    elxmail.on('sent', (e) => { sentEvent = e; });

    await elxmail.send({
      to: 'event-test@example.com',
      subject: 'Event test',
      body: 'Body'
    });

    assert.ok(sentEvent, 'sent event was not emitted');
    assert.equal(sentEvent.to, 'event-test@example.com');
    assert.equal(sentEvent.domain, 'test.com');
    assert.ok(sentEvent.messageId);

    elxmail.shutdown();
  });

  it('respects suppression list', async () => {
    elxmail.init({
      transports: [
        { type: 'smtp', domain: 'test.com', host: '127.0.0.1', port: TEST_PORT, auth: { user: 'x', pass: 'x' } }
      ],
      logger: { level: 'error' },
      dns: { autoValidate: false },
      warmup: { enabled: false }
    });

    elxmail.suppress.add('blocked@example.com', 'manual');

    const result = await elxmail.send({
      to: 'blocked@example.com',
      subject: 'Should not send',
      body: 'Body'
    });

    assert.equal(result.status, 'suppressed');
    assert.equal(mockServer.getMessages().length, 0);

    elxmail.shutdown();
  });

  it('processes bounces and auto-suppresses', async () => {
    mockServer.rejectRecipients(['bad@example.com']);

    elxmail.init({
      transports: [
        { type: 'smtp', domain: 'test.com', host: '127.0.0.1', port: TEST_PORT, auth: { user: 'x', pass: 'x' } }
      ],
      logger: { level: 'error' },
      dns: { autoValidate: false },
      warmup: { enabled: false },
      queue: { retryAttempts: 0 }
    });

    let bounceEvent = null;
    elxmail.on('bounce:hard', (e) => { bounceEvent = e; });

    await assert.rejects(
      elxmail.send({ to: 'bad@example.com', subject: 'Test', body: 'Body' }),
      /SMTP send failed/
    );

    // Give event loop time to process bounce event
    await new Promise(r => setTimeout(r, 50));

    assert.ok(bounceEvent, 'bounce:hard event not emitted');

    elxmail.shutdown();
  });

  it('rotates across multiple domains', async () => {
    elxmail.init({
      transports: [
        { type: 'smtp', domain: 'a.com', host: '127.0.0.1', port: TEST_PORT, auth: { user: 'x', pass: 'x' } },
        { type: 'smtp', domain: 'b.com', host: '127.0.0.1', port: TEST_PORT, auth: { user: 'x', pass: 'x' } },
        { type: 'smtp', domain: 'c.com', host: '127.0.0.1', port: TEST_PORT, auth: { user: 'x', pass: 'x' } }
      ],
      rotation: { strategy: 'round-robin' },
      logger: { level: 'error' },
      dns: { autoValidate: false },
      warmup: { enabled: false }
    });

    const sentDomains = [];
    elxmail.on('sent', (e) => sentDomains.push(e.domain));

    await elxmail.send({ to: 'r1@example.com', subject: 'T', body: 'B' });
    await elxmail.send({ to: 'r2@example.com', subject: 'T', body: 'B' });
    await elxmail.send({ to: 'r3@example.com', subject: 'T', body: 'B' });

    // Round-robin should cycle through all 3
    assert.equal(new Set(sentDomains).size, 3);

    elxmail.shutdown();
  });

  it('records analytics for sent emails', async () => {
    elxmail.init({
      transports: [
        { type: 'smtp', domain: 'test.com', host: '127.0.0.1', port: TEST_PORT, auth: { user: 'x', pass: 'x' } }
      ],
      logger: { level: 'error' },
      dns: { autoValidate: false },
      warmup: { enabled: false }
    });

    await elxmail.send({ to: 'a@example.com', subject: 'T', body: 'B' });
    await elxmail.send({ to: 'b@example.com', subject: 'T', body: 'B' });

    // Allow analytics collector to process events
    await new Promise(r => setTimeout(r, 50));

    const summary = elxmail.analytics.summary();
    assert.equal(summary.sent, 2);

    elxmail.shutdown();
  });

  it('sendBatch handles multiple emails', async () => {
    elxmail.init({
      transports: [
        { type: 'smtp', domain: 'test.com', host: '127.0.0.1', port: TEST_PORT, auth: { user: 'x', pass: 'x' } }
      ],
      logger: { level: 'error' },
      dns: { autoValidate: false },
      warmup: { enabled: false }
    });

    const result = await elxmail.sendBatch([
      { to: 'a@example.com', subject: 'T', body: 'B' },
      { to: 'b@example.com', subject: 'T', body: 'B' },
      { to: 'c@example.com', subject: 'T', body: 'B' }
    ]);

    assert.equal(result.total, 3);
    assert.equal(result.sent, 3);
    assert.equal(result.failed, 0);
    assert.equal(mockServer.getMessages().length, 3);

    elxmail.shutdown();
  });

  it('template variables get substituted', async () => {
    elxmail.init({
      transports: [
        { type: 'smtp', domain: 'test.com', host: '127.0.0.1', port: TEST_PORT, auth: { user: 'x', pass: 'x' } }
      ],
      logger: { level: 'error' },
      dns: { autoValidate: false },
      warmup: { enabled: false }
    });

    await elxmail.send({
      to: 'john@example.com',
      subject: 'Hi {{name}}',
      body: '<p>Hello {{name}} from {{company}}</p>',
      data: { name: 'John', company: 'Acme' }
    });

    const received = mockServer.getMessages()[0];
    assert.ok(received.content.includes('Hi John'));
    assert.ok(received.content.includes('Hello John from Acme'));

    elxmail.shutdown();
  });

  it('queue can pause and resume', async () => {
    elxmail.init({
      transports: [
        { type: 'smtp', domain: 'test.com', host: '127.0.0.1', port: TEST_PORT, auth: { user: 'x', pass: 'x' } }
      ],
      logger: { level: 'error' },
      dns: { autoValidate: false },
      warmup: { enabled: false }
    });

    elxmail.queue.pause();
    assert.equal(elxmail.queue.status.paused, true);

    elxmail.queue.resume();
    assert.equal(elxmail.queue.status.paused, false);

    elxmail.shutdown();
  });
});
