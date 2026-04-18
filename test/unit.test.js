'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// ─── Errors ────────────────────────────────────────────────────────────

describe('errors', () => {
  const { ElxError, ElxConfigError, ElxTransportError } = require('../errors');

  it('ElxError has code, component, and details', () => {
    const err = new ElxError('test', { code: 'TEST', component: 'core', details: { field: 'x' } });
    assert.equal(err.name, 'ElxError');
    assert.equal(err.code, 'TEST');
    assert.equal(err.component, 'core');
    assert.deepEqual(err.details, { field: 'x' });
    assert.ok(err instanceof Error);
  });

  it('ElxConfigError is instanceof ElxError', () => {
    const err = new ElxConfigError('bad config');
    assert.ok(err instanceof ElxError);
    assert.equal(err.code, 'ELX_CONFIG_ERROR');
    assert.equal(err.component, 'config');
  });
});

// ─── Events ────────────────────────────────────────────────────────────

describe('events', () => {
  let bus;

  beforeEach(() => {
    bus = require('../events');
    bus.removeAllListeners();
  });

  it('emits and receives events', () => {
    let received = null;
    bus.on('test', (data) => { received = data; });
    bus.emit('test', 'hello');
    assert.equal(received, 'hello');
  });

  it('wildcard matching works', () => {
    const events = [];
    bus.on('bounce:*', (data) => events.push(data));
    bus.emit('bounce:hard', 1);
    bus.emit('bounce:soft', 2);
    bus.emit('sent', 3);
    assert.deepEqual(events, [1, 2]);
  });
});

// ─── Utils ─────────────────────────────────────────────────────────────

describe('utils/email-parser', () => {
  const { isValid, extractDomain, normalize } = require('../utils/email-parser');

  it('validates correct emails', () => {
    assert.ok(isValid('john@gmail.com'));
    assert.ok(isValid('user.name+tag@domain.co.uk'));
  });

  it('rejects invalid emails', () => {
    assert.ok(!isValid(''));
    assert.ok(!isValid('notanemail'));
    assert.ok(!isValid('@domain.com'));
    assert.ok(!isValid(null));
  });

  it('extracts domain', () => {
    assert.equal(extractDomain('john@gmail.com'), 'gmail.com');
    assert.equal(extractDomain('user@DOMAIN.COM'), 'domain.com');
    assert.equal(extractDomain('nope'), null);
  });

  it('normalizes email', () => {
    assert.equal(normalize('  JOHN@Gmail.COM  '), 'john@gmail.com');
  });
});

describe('utils/template', () => {
  const { render, extractVariables } = require('../utils/template');

  it('replaces variables', () => {
    assert.equal(render('Hi {{name}}', { name: 'John' }), 'Hi John');
  });

  it('leaves unmatched variables', () => {
    assert.equal(render('Hi {{name}} from {{company}}', { name: 'John' }), 'Hi John from {{company}}');
  });

  it('extracts variable names', () => {
    assert.deepEqual(extractVariables('{{a}} and {{b}}'), ['a', 'b']);
  });
});

describe('utils/ip', () => {
  const ip = require('../utils/ip');

  it('validates IPs', () => {
    assert.ok(ip.isValid('192.168.1.1'));
    assert.ok(ip.isValid('2001:db8::1'));
    assert.ok(!ip.isValid('not-an-ip'));
  });

  it('detects private IPs', () => {
    assert.ok(ip.isPrivate('10.0.0.1'));
    assert.ok(ip.isPrivate('192.168.1.1'));
    assert.ok(ip.isPrivate('127.0.0.1'));
    assert.ok(!ip.isPrivate('8.8.8.8'));
  });
});

// ─── Config ────────────────────────────────────────────────────────────

describe('config', () => {
  const store = require('../config/store');

  afterEach(() => store.reset());

  it('initializes with shorthand syntax', () => {
    const config = store.init({
      domains: [
        { domain: 'test.com', smtp: { host: '1.2.3.4', port: 587, user: 'u', pass: 'p' } }
      ]
    });
    assert.equal(config.transports.length, 1);
    assert.equal(config.transports[0].domain, 'test.com');
    assert.equal(config.transports[0].type, 'smtp');
  });

  it('applies defaults', () => {
    const config = store.init({
      domains: [{ domain: 'test.com', smtp: { host: '1.2.3.4', port: 587, user: 'u', pass: 'p' } }]
    });
    assert.equal(config.throttle.perDomain.max, 120);
    assert.equal(config.warmup.enabled, true);
    assert.equal(config.queue.concurrency, 10);
  });

  it('freezes config', () => {
    const config = store.init({
      domains: [{ domain: 'test.com', smtp: { host: '1.2.3.4', port: 587, user: 'u', pass: 'p' } }]
    });
    assert.ok(Object.isFrozen(config));
    assert.ok(Object.isFrozen(config.throttle));
  });

  it('rejects empty config', () => {
    assert.throws(() => store.init({}), /at least one transport/i);
  });

  it('rejects duplicate domains', () => {
    assert.throws(() => store.init({
      transports: [
        { type: 'smtp', domain: 'x.com', host: '1.2.3.4', port: 587, auth: { user: 'u', pass: 'p' } },
        { type: 'smtp', domain: 'x.com', host: '1.2.3.5', port: 587, auth: { user: 'u', pass: 'p' } }
      ]
    }), /duplicate/i);
  });
});

// ─── Queue ─────────────────────────────────────────────────────────────

describe('queue/memory', () => {
  const { MemoryQueue } = require('../queue/adapters/memory');

  it('maintains priority order', () => {
    const q = new MemoryQueue();
    q.enqueue({ id: 'low' }, 5);
    q.enqueue({ id: 'high' }, 1);
    q.enqueue({ id: 'mid' }, 3);

    assert.equal(q.dequeue().id, 'high');
    assert.equal(q.dequeue().id, 'mid');
    assert.equal(q.dequeue().id, 'low');
  });

  it('returns null when empty', () => {
    const q = new MemoryQueue();
    assert.equal(q.dequeue(), null);
  });

  it('tracks size correctly', () => {
    const q = new MemoryQueue();
    q.enqueue({ id: 1 }, 1);
    q.enqueue({ id: 2 }, 1);
    assert.equal(q.size(), 2);
    q.dequeue();
    assert.equal(q.size(), 1);
  });
});

// ─── Classifier ────────────────────────────────────────────────────────

describe('classifier', () => {
  const { classify, getThrottleGroup, clearCache } = require('../classifier/classifier');

  afterEach(() => clearCache());

  it('classifies known freemail providers', async () => {
    assert.equal(await classify('john@gmail.com'), 'gmail');
    assert.equal(await classify('sarah@hotmail.com'), 'outlook');
    assert.equal(await classify('bob@yahoo.com'), 'yahoo');
    assert.equal(await classify('alice@icloud.com'), 'apple');
  });

  it('maps providers to throttle groups', () => {
    assert.equal(getThrottleGroup('gmail'), 'gmail');
    assert.equal(getThrottleGroup('google_workspace'), 'gmail');
    assert.equal(getThrottleGroup('outlook'), 'outlook');
    assert.equal(getThrottleGroup('microsoft365'), 'outlook');
    assert.equal(getThrottleGroup('self_hosted'), 'default');
  });
});

// ─── Throttle ──────────────────────────────────────────────────────────

describe('throttle', () => {
  const { SlidingWindow } = require('../throttle/window');

  it('allows up to max events', () => {
    const w = new SlidingWindow(3, 'hour');
    assert.ok(w.check().allowed);
    w.record(); w.record(); w.record();
    assert.ok(!w.check().allowed);
  });

  it('counts correctly', () => {
    const w = new SlidingWindow(10, 'hour');
    w.record(); w.record();
    assert.equal(w.count(), 2);
    assert.equal(w.check().remaining, 8);
  });
});

// ─── Rotation ──────────────────────────────────────────────────────────

describe('rotation', () => {
  const { RotationEngine } = require('../rotation/engine');

  it('round-robin cycles through transports', () => {
    const engine = new RotationEngine({
      transports: [{ domain: 'a.com' }, { domain: 'b.com' }, { domain: 'c.com' }],
      rotationConfig: { strategy: 'round-robin' }
    });

    assert.equal(engine.pick('gmail').transport.domain, 'a.com');
    assert.equal(engine.pick('gmail').transport.domain, 'b.com');
    assert.equal(engine.pick('gmail').transport.domain, 'c.com');
    assert.equal(engine.pick('gmail').transport.domain, 'a.com');
  });

  it('weighted gives approximate distribution', () => {
    const engine = new RotationEngine({
      transports: [{ domain: 'a.com' }, { domain: 'b.com' }],
      rotationConfig: { strategy: 'weighted', weights: { 'a.com': 80, 'b.com': 20 } }
    });

    const counts = { 'a.com': 0, 'b.com': 0 };
    for (let i = 0; i < 1000; i++) {
      counts[engine.pick('gmail').transport.domain]++;
    }
    // a.com should get ~80% (±10% tolerance)
    assert.ok(counts['a.com'] > 600, `Expected a.com > 600, got ${counts['a.com']}`);
  });
});

// ─── Warmup ────────────────────────────────────────────────────────────

describe('warmup', () => {
  const { getLimit, DEFAULT_CURVE } = require('../warmup/curves');

  it('returns correct limits for defined days', () => {
    assert.equal(getLimit(DEFAULT_CURVE, 1), 20);
    assert.equal(getLimit(DEFAULT_CURVE, 14), 200);
    assert.equal(getLimit(DEFAULT_CURVE, 28), 500);
  });

  it('interpolates between points', () => {
    const day2 = getLimit(DEFAULT_CURVE, 2);
    assert.ok(day2 > 20 && day2 < 50, `Expected between 20-50, got ${day2}`);
  });

  it('returns last value past end', () => {
    assert.equal(getLimit(DEFAULT_CURVE, 100), 500);
  });
});

// ─── Suppression ───────────────────────────────────────────────────────

describe('suppression', () => {
  const { MemorySuppressionAdapter } = require('../suppression/adapters/memory');

  it('add and check', () => {
    const s = new MemorySuppressionAdapter();
    s.add('bad@test.com', 'bounce');
    assert.ok(s.check('bad@test.com'));
    assert.ok(!s.check('good@test.com'));
  });

  it('import and export', () => {
    const s = new MemorySuppressionAdapter();
    s.import(['a@t.com', 'b@t.com'], 'import');
    assert.equal(s.size(), 2);
    assert.equal(s.export().length, 2);
  });

  it('remove works', () => {
    const s = new MemorySuppressionAdapter();
    s.add('x@t.com');
    assert.ok(s.check('x@t.com'));
    s.remove('x@t.com');
    assert.ok(!s.check('x@t.com'));
  });
});

// ─── Bounce ────────────────────────────────────────────────────────────

describe('bounce', () => {
  const { parse } = require('../bounce/parser');
  const { classify } = require('../bounce/classifier');

  it('parses standard SMTP responses', () => {
    const r = parse('550 5.1.1 The email account does not exist');
    assert.equal(r.code, 550);
    assert.equal(r.enhanced, '5.1.1');
    assert.ok(r.message.includes('does not exist'));
  });

  it('classifies hard bounces', () => {
    const c = classify({ code: 550, enhanced: '5.1.1', message: '' });
    assert.equal(c.type, 'hard');
    assert.equal(c.category, 'address');
  });

  it('classifies soft bounces', () => {
    const c = classify({ code: 452, enhanced: '4.2.2', message: '' });
    assert.equal(c.type, 'soft');
    assert.equal(c.category, 'mailbox');
  });

  it('classifies by provider patterns', () => {
    const c = classify({ code: 550, enhanced: null, message: 'The email account that you tried to reach does not exist' });
    assert.equal(c.type, 'hard');
    assert.equal(c.category, 'address');
  });
});

// ─── Bloom Filter ──────────────────────────────────────────────────────

describe('bloom filter', () => {
  const { BloomFilter } = require('../suppression/bloom');

  it('has no false negatives', () => {
    const bf = new BloomFilter(1000, 0.01);
    for (let i = 0; i < 100; i++) bf.add('user' + i);
    for (let i = 0; i < 100; i++) assert.ok(bf.check('user' + i));
  });

  it('returns false for unknown items', () => {
    const bf = new BloomFilter(1000, 0.01);
    bf.add('known');
    assert.ok(!bf.check('unknown123xyz'));
  });
});

// ─── Content Scorer ────────────────────────────────────────────────────

describe('content scorer', () => {
  const { scoreContent } = require('../content/scorer');

  it('scores clean emails high', () => {
    const { score } = scoreContent({ subject: 'Quick question', body: 'Hi {{name}}' });
    assert.ok(score >= 90, `Expected >= 90, got ${score}`);
  });

  it('scores spammy emails low', () => {
    const { score } = scoreContent({ subject: 'FREE MONEY!!!', body: 'Buy now! Click here!!!' });
    assert.ok(score < 70, `Expected < 70, got ${score}`);
  });
});

// ─── Composer ──────────────────────────────────────────────────────────

describe('composer', () => {
  const { compose, stripHtml } = require('../transport/composer');

  it('composes a complete message', () => {
    const msg = compose(
      { to: 'john@test.com', subject: 'Test', body: '<p>Hello</p>' },
      { domain: 'out.com' },
      {}
    );
    assert.equal(msg.to, 'john@test.com');
    assert.equal(msg.from, 'noreply@out.com');
    assert.ok(msg.headers['Message-ID'].includes('@out.com'));
  });

  it('applies template variables', () => {
    const msg = compose(
      { to: 'a@b.com', subject: 'Hi {{name}}', body: '{{name}}', data: { name: 'Jo' } },
      { domain: 'x.com' },
      {}
    );
    assert.equal(msg.subject, 'Hi Jo');
    assert.equal(msg.html, 'Jo');
  });

  it('strips HTML correctly', () => {
    assert.equal(stripHtml('<p>Hello</p>'), 'Hello');
    assert.ok(stripHtml('<a href="http://x.com">Link</a>').includes('Link'));
  });
});
