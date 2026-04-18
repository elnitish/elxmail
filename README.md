# elxmail

> **An open-source cold email delivery protocol SDK for Node.js.**
> Plug it into your backend and it handles the deliverability engineering most developers get wrong about email at scale.

```bash
npm install elxmail
```

```js
const elxmail = require('elxmail')

elxmail.init({
  domains: [
    { domain: 'outreach1.com', smtp: { host: '1.2.3.4', port: 587, user: 'me', pass: 'secret' } }
  ]
})

await elxmail.send({
  to: 'john@gmail.com',
  subject: 'Quick question',
  body: 'Hi John...'
})
```

That's it. Behind those 5 lines, elxmail handles **13 internal components** — rotation, throttling, warm-up, bounce processing, complaint handling, suppression, DNS validation, provider classification, analytics, and more.

---

## Table of Contents

- [Why elxmail](#why-elxmail)
- [Quickstart](#quickstart)
- [The Deliverability Playbook](#the-deliverability-playbook)
- [Infrastructure Ratios](#infrastructure-ratios)
- [Cost Comparison](#cost-comparison)
- [Configuration Reference](#configuration-reference)
- [API Reference](#api-reference)
- [Events](#events)
- [Architecture](#architecture)
- [FAQ](#faq)

---

## Why elxmail

Sending one email is easy. Sending 10,000 emails per day to inboxes (not spam folders) is brutal engineering. Most developers learn this the hard way:

| Problem | What happens | What elxmail does |
|---|---|---|
| Bad DNS setup | Emails go straight to spam | Validates SPF, DKIM, DMARC, rDNS before sending |
| Sending too fast | IP gets blacklisted by Gmail | Throttles per IP, domain, and provider with sliding windows |
| New domain has zero reputation | Even small volumes go to spam | Auto warm-up with 28-day ramp curve |
| One bad domain kills everything | Single complaint destroys reputation | Distributes across multiple domains/IPs via rotation |
| Dead addresses keep getting emailed | Bounce rate climbs, deliverability tanks | Auto-suppresses hard bounces |
| Spam complaints go unnoticed | More complaints, worse reputation | FBL handler auto-blacklists complainers |
| Different rules for Gmail/Outlook/Yahoo | Random throttling decisions | Provider classifier + per-provider limits |
| No visibility into deliverability | Flying blind | Full analytics: sent, delivered, bounced, opened, clicked, complained |
| Building all this takes months | Wasted time | One npm package |
| SaaS platforms charge $500-2000/mo | Vendor lock-in + cold email bans | Self-hosted, ~$140/mo for 20k/day |

**One sentence:** elxmail bridges the gap between "I can send an email with nodemailer" and "I can reliably land 10,000 emails in inboxes every day without getting blacklisted."

---

## Quickstart

### 1. Install

```bash
npm install elxmail
```

### 2. Configure

The minimal config — one domain, one SMTP server. Everything else uses smart defaults:

```js
const elxmail = require('elxmail')

elxmail.init({
  domains: [
    {
      domain: 'outreach1.com',
      smtp: {
        host: '1.2.3.4',
        port: 587,
        user: 'me',
        pass: 'secret'
      }
    }
  ]
})
```

### 3. Send

```js
await elxmail.send({
  to: 'john@gmail.com',
  subject: 'Quick question',
  body: '<p>Hi John, I noticed your team is hiring...</p>'
})
```

### 4. Bulk send

```js
await elxmail.sendBatch([
  { to: 'john@gmail.com', subject: 'Hi {{name}}', body: '...', data: { name: 'John' } },
  { to: 'sarah@outlook.com', subject: 'Hi {{name}}', body: '...', data: { name: 'Sarah' } },
  // ... 5,000 more
])
```

elxmail accepts all 5,000 immediately and intelligently spaces them out over hours, respecting rate limits, warm-up curves, and provider rules.

### 5. Listen for events

```js
elxmail.on('sent', e => console.log(`Sent to ${e.to} via ${e.domain}`))
elxmail.on('bounced', e => console.log(`Bounced: ${e.email} (${e.type})`))
elxmail.on('complained', e => console.log(`Spam complaint: ${e.email}`))
```

### 6. Check analytics

```js
const stats = elxmail.analytics.summary()
// {
//   sent: 4500, delivered: 4200, bounced: 50,
//   opened: 1800, clicked: 600, complained: 5,
//   deliveryRate: '93.3%', openRate: '42.8%'
// }
```

---

## The Deliverability Playbook

This is the playbook to follow for **85-95% inbox placement**. Skip any phase and your deliverability drops.

### Phase 1: Infrastructure Setup (Day 0)

Before writing a single line of code, prepare your raw materials.

**Domains** — Buy based on target daily volume. Rule of thumb: **1 domain handles 100-120 emails/day safely**.

- 1,000 emails/day → 10 domains
- 10,000 emails/day → 84 domains
- Don't use your main business domain. Buy separate niche-relevant domains.
- Cheap TLDs work fine: `.xyz`, `.site`, `.online` ($2-4/year each)

**IPs** — Get based on domain count. Rule of thumb: **1 IP handles 5-7 domains**.

- 10 domains → 2 IPs
- 84 domains → 12 IPs
- Either buy multiple IPs on a single VPS or set up relay servers.

**SMTP server** — Install your mail transfer agent on a VPS:
- **Postfix** — free, simple, well-documented
- **Haraka** — Node.js native, programmable
- **PowerMTA** — commercial, industry standard

### Phase 2: DNS Configuration (Day 0-1)

Every domain needs **4 DNS records**. No exceptions.

| Record | Purpose | Format |
|---|---|---|
| **SPF** | Authorizes IPs to send for your domain | `v=spf1 ip4:1.2.3.4 ~all` |
| **DKIM** | Cryptographic signature on every email | `v=DKIM1; k=rsa; p=...` |
| **DMARC** | Tells receivers what to do with auth failures | `v=DMARC1; p=quarantine` |
| **rDNS** | IP resolves back to a domain | Configure in VPS provider |

elxmail can **generate DKIM keys** for you:

```js
const { publicKey, privateKey } = elxmail.utils.generateDKIMKeyPair()
// Save privateKey to disk, publish publicKey in DNS as TXT record
```

After configuring, **validate everything before sending a single email**:

```js
const report = await elxmail.validateDNS()
console.log(report)
// {
//   domains: {
//     'outreach1.com': {
//       spf:  { status: 'pass', record: 'v=spf1 ip4:1.2.3.4 ~all' },
//       dkim: { status: 'pass' },
//       dmarc: { status: 'pass', policy: { p: 'quarantine' } },
//       rdns: { '1.2.3.4': { status: 'pass', matched: 'outreach1.com' } }
//     }
//   },
//   summary: { totalDomains: 1, checks: { pass: 4, fail: 0, warn: 0 }, healthy: true }
// }
```

**Sending with broken DNS is worse than not sending at all.**

### Phase 3: Install and Configure elxmail (Day 1)

```js
const elxmail = require('elxmail')

elxmail.init({
  transports: [
    { type: 'smtp', domain: 'outreach1.com', bindIP: '1.2.3.4', host: '0.0.0.0', port: 587, auth: { user: '...', pass: '...' } },
    { type: 'smtp', domain: 'outreach2.com', bindIP: '1.2.3.5', host: '0.0.0.0', port: 587, auth: { user: '...', pass: '...' } }
    // ...all your domains
  ],
  rotation: { strategy: 'round-robin' },
  throttle: {
    perDomain: { max: 100, per: 'day' },
    perProvider: {
      gmail:   { max: 30, per: 'hour' },
      outlook: { max: 40, per: 'hour' }
    }
  },
  warmup: { enabled: true, plan: 'default' },
  dkim: {
    selector: 'elx',
    keys: {
      'outreach1.com': './keys/outreach1.pem',
      'outreach2.com': './keys/outreach2.pem'
    }
  }
})
```

### Phase 4: Warm-up Period (Day 1-28)

This is where patience pays off. elxmail enforces the warm-up automatically — but you need to feed it **real emails** (not test sends).

Default warm-up curve:

| Day | Max emails per domain |
|---|---|
| 1 | 20 |
| 3 | 50 |
| 7 | 100 |
| 14 | 200 |
| 21 | 350 |
| 28 | 500 |

elxmail interpolates intermediate days. If you try to send 200 emails on Day 1, it sends 20 and queues the rest for tomorrow.

**Critical rules during warm-up:**
- Send to your **most engaged audience first** — engagement signals build reputation faster than anything else.
- Avoid purchased or scraped lists during warm-up.
- Keep content clean — no spammy subjects, no excessive links.
- Monitor: `elxmail.warmup.status()` shows day, limit, and health per domain.

If a domain starts bouncing or getting complaints, elxmail's **auto-slowdown** kicks in — reduces volume and extends warm-up.

### Phase 5: List Hygiene (Before Every Campaign)

Clean your list before loading it. A clean list means low bounce rates → better reputation → better inbox placement.

This single step can be the difference between **60% and 90% inbox rate**.

### Phase 6: Content Optimization

elxmail includes a content scorer:

```js
const score = elxmail.scoreContent({
  subject: 'Quick question about your Q3 roadmap',
  body: '<p>Hi {{firstName}}, I noticed your team is expanding...</p>'
})
// { score: 100, issues: [{ type: 'personalization', message: '...', penalty: -10 }] }
```

It checks for:
- Spam trigger words (FREE, ACT NOW, CONGRATULATIONS, etc.)
- ALL CAPS in subject
- Excessive punctuation (!!!, ???)
- Link count (>3 is suspicious)
- HTML-to-text ratio
- Personalization (bonus points)

**Content guidelines:**
- Subject lines under 50 characters
- Use the recipient's name
- 1-2 links max
- Always include plain text version (auto-generated by default)
- Always include unsubscribe link

### Phase 7: Sending at Scale (Day 28+)

After warm-up, you're cleared for full volume:

```js
await elxmail.sendBatch(emailList)  // 10,000 emails
```

elxmail handles everything — rotation, throttling, provider rules, bounce processing, complaint handling, suppression, analytics.

**Key metrics to watch:**
- Delivery rate > 95%
- Bounce rate < 3%
- Complaint rate < 0.1%
- Open rate indicates content + inbox placement quality

```js
const daily = elxmail.analytics.summary({ period: 'today' })
const byDomain = elxmail.analytics.byDomain('outreach1.com')
const byProvider = elxmail.analytics.byProvider('gmail')
```

### Phase 8: Ongoing Maintenance

- **Rotate burned domains.** If a domain's reputation drops and doesn't recover after 2 weeks of reduced volume, retire it and buy a new one.
- **Monitor suppression list growth.** If it's growing fast, your source list quality is bad.
- **Track provider trends.** Gmail might tighten rules, Outlook might change thresholds — adjust per-provider limits.

### The Efficiency Formula

```
Inbox Placement Rate =
    Clean DNS (SPF + DKIM + DMARC + rDNS)
  + Proper Warm-up (gradual ramp over 4 weeks)
  + Clean Lists (verified, no invalid emails)
  + Good Content (personalized, no spam triggers)
  + Smart Distribution (rotation across domains and IPs)
  + Volume Discipline (throttling per provider)
  + Reputation Monitoring (retire bad domains, suppress complaints)
```

Skip any one of these and your inbox rate drops. Follow all of them through elxmail's workflow → **85-95% inbox placement consistently**.

---

## Infrastructure Ratios

The math behind how many domains, IPs, and VPS nodes you need at each volume tier.

**Golden ratios** (from real-world cold email infrastructure):

```
Emails per domain per day: 120
Domains per IP:            7
IPs per VPS:               10-12
```

**Formulas:**

```
Domains needed:  ceil(dailyVolume / 120)
IPs needed:      ceil(domains / 7)
VPS needed:      ceil(IPs / 12)

Monthly cost ≈ dailyVolume × $0.007
            ≈ ~$7 per 1,000 emails/day of capacity
```

### Volume Tiers

#### 500 emails/day

| | Safe | Optimized | Aggressive |
|---|---|---|---|
| Emails/domain/day | 100 | 100 | 150 |
| Domains | 5 | 5 | 4 |
| IPs | 1 | 1 | 1 |
| VPS | 1 | 1 | 1 |
| **Monthly cost** | **$6.25** | **$6.25** | **$6** |

#### 1,000 emails/day

| | Safe | Optimized | Aggressive |
|---|---|---|---|
| Domains | 10 | 10 | 7 |
| IPs | 2 | 2 | 1 |
| VPS | 1 | 1 | 1 |
| **Monthly cost** | **$10.50** | **$10.50** | **$6.75** |

#### 5,000 emails/day

| | Safe | Optimized | Aggressive |
|---|---|---|---|
| Domains | 50 | 42 | 34 |
| IPs | 10 | 7 | 5 |
| VPS | 1 | 1 | 1 |
| **Monthly cost** | **$49.50** | **$38.50** | **$30.50** |

#### 10,000 emails/day

| | Safe | Optimized | Aggressive |
|---|---|---|---|
| Domains | 100 | 84 | 67 |
| IPs | 20 | 12 | 9 |
| VPS | 2 | 1 | 1 |
| **Monthly cost** | **$102** | **$69** | **$55.75** |

#### 20,000 emails/day

| | Safe | Optimized | Aggressive |
|---|---|---|---|
| Domains | 200 | 167 | 134 |
| IPs | 40 | 24 | 17 |
| VPS | 4 | 2 | 2 |
| **Monthly cost** | **$207** | **$140.75** | **$111.50** |
| **Cost per 1k emails** | $0.35 | $0.23 | $0.19 |

#### 50,000 emails/day

| | Safe | Optimized | Aggressive |
|---|---|---|---|
| Domains | 500 | 417 | 334 |
| IPs | 100 | 60 | 42 |
| VPS | 10 | 5 | 4 |
| **Monthly cost** | **$522** | **$356** | **$266.50** |

**Recommendation:** The **Optimized** profile is the sweet spot. It saves ~30% vs Safe with minimal added risk.

### Cost ranking per unit

| Resource | Cost | Notes |
|---|---|---|
| **Domains** | $0.25/month each | Cheapest. Be generous, retire burned ones. |
| **VPS** | $5-15/month each | Mid. One beefy VPS handles 10k+ emails/day. |
| **IPs** | $2-5/month each | Most expensive. Protect them by spreading load. |

---

## Cost Comparison

For **20,000 emails/day** (600,000/month):

| Provider | Monthly Cost | Cost per 1k | Cold-email friendly? |
|---|---|---|---|
| **elxmail (self-hosted)** | **$140** | **$0.23** | ✅ You control everything |
| Amazon SES | $60 | $0.10 | ❌ Will suspend you |
| SendGrid | $400-500 | $0.67-0.83 | ❌ Bans cold email |
| Mailgun | $400-550 | $0.67-0.92 | ❌ Bans cold email |
| Mailchimp/Mandrill | $500-700 | $0.83-1.17 | ❌ Explicitly banned |
| Smartlead | $800-1,500 | $1.33-2.50 | ✅ But expensive |
| Instantly.ai | $1,848 | $3.08 | ✅ But very expensive |
| Lemlist | $500-1,000 | $0.83-1.67 | ✅ Limited at scale |
| Infra consultant | $500-1,500 | $0.83-2.50 | ✅ Paying humans for what an SDK can do |

**Annual savings vs cold-email-friendly platforms:** $4,300 - $20,400.

The cheap platforms (SES, SendGrid, Mailgun) will kick you out for cold email. The cold-email-friendly platforms (Instantly, Smartlead) charge a premium because they know it. **elxmail sits in the gap** — self-hosted cost with the intelligence of a cold email platform.

---

## Configuration Reference

### Minimal config

```js
elxmail.init({
  domains: [
    { domain: 'outreach1.com', smtp: { host: '1.2.3.4', port: 587, user: '...', pass: '...' } }
  ]
})
```

### Full config

```js
elxmail.init({
  // ─── TRANSPORTS — where emails physically go out ───
  transports: [
    // Direct SMTP with IP binding
    {
      type: 'smtp',
      domain: 'outreach1.com',
      bindIP: '192.168.1.10',
      host: '0.0.0.0',
      port: 587,
      auth: { user: 'me', pass: 'secret' },
      tls: true,
      pool: { maxConnections: 5, maxMessages: 100 }
    },

    // Relay server (separate forwarder VPS)
    {
      type: 'relay',
      domain: 'outreach2.com',
      host: 'relay1.myinfra.com',
      port: 587,
      auth: { user: 'relay_user', pass: 'relay_pass' }
    },

    // Cloud provider (SES, SendGrid, Mailgun)
    {
      type: 'provider',
      name: 'ses',
      domain: 'outreach3.com',
      region: 'us-east-1',
      credentials: { accessKeyId: '...', secretAccessKey: '...' }
    }
  ],

  // ─── ROTATION — how emails are distributed ───
  rotation: {
    strategy: 'weighted',         // 'round-robin' | 'weighted' | 'random'
    weights: {
      'outreach1.com': 40,
      'outreach2.com': 35,
      'outreach3.com': 25
    },
    stickyProvider: true          // same recipient provider → same sending domain
  },

  // ─── THROTTLE — rate limits ───
  throttle: {
    global:    { max: 5000, per: 'hour' },
    perDomain: { max: 120,  per: 'day' },
    perIP:     { max: 500,  per: 'day' },
    perProvider: {
      gmail:   { max: 30, per: 'hour' },
      outlook: { max: 40, per: 'hour' },
      yahoo:   { max: 25, per: 'hour' },
      default: { max: 50, per: 'hour' }
    },
    perSecond: 10,
    cooldown: {
      errorThreshold: 5,          // 5 errors in window
      windowSeconds: 60,
      pauseMinutes: 10            // pause transport for 10 min
    }
  },

  // ─── WARM-UP — gradual ramp for new domains ───
  warmup: {
    enabled: true,
    plan: 'default',              // 'default' | 'conservative' | 'aggressive'

    // OR custom curve
    curve: [
      { day: 1,  maxPerDomain: 20 },
      { day: 7,  maxPerDomain: 100 },
      { day: 28, maxPerDomain: 500 }
    ],

    startDate: {
      'outreach1.com': '2026-03-01'   // already 6 weeks old
    },

    autoSlowdown: true            // reduce volume on bounce spikes
  },

  // ─── SUPPRESSION — blacklist storage ───
  suppression: {
    adapter: 'sqlite',            // 'memory' | 'sqlite'
    path: './data/suppression.db',
    autoSuppress: {
      hardBounce: true,
      complaint: true,
      softBounceAfter: 3
    }
  },

  // ─── DKIM — signing ───
  dkim: {
    selector: 'elx',
    keys: {
      'outreach1.com': './keys/outreach1.pem',
      'outreach2.com': './keys/outreach2.pem'
    }
  },

  // ─── QUEUE — processing ───
  queue: {
    adapter: 'memory',            // 'memory' (Redis/Bull coming)
    concurrency: 10,
    retryAttempts: 3,
    retryDelay: 300,
    retryBackoff: 'exponential'
  },

  // ─── TRACKING — opens and clicks ───
  tracking: {
    enabled: true,
    opens: true,
    clicks: true,
    domain: 'track.myapp.com',
    unsubscribe: {
      enabled: true,
      url: 'https://myapp.com/unsubscribe?id={{emailId}}'
    }
  },

  // ─── ANALYTICS ───
  analytics: {
    adapter: 'sqlite',            // 'memory' | 'sqlite'
    path: './data/analytics.db',
    retention: 90                 // days
  },

  // ─── LOGGER ───
  logger: {
    level: 'info',                // 'debug' | 'info' | 'warn' | 'error'
    output: 'both',               // 'console' | 'file' | 'both'
    filePath: './logs/elxmail.log',
    rotation: { maxSize: '50mb', maxFiles: 10, compress: true },
    format: 'text'                // 'json' | 'text'
  },

  // ─── DNS validation ───
  dns: {
    autoValidate: true,
    failOnError: false,
    checkInterval: 86400,         // seconds (24h)
    timeout: 5000
  },

  // ─── CONTENT rules ───
  content: {
    autoPlainText: true,
    spamCheck: true,
    spamThreshold: 70,
    maxLinksPerEmail: 3,
    requiredHeaders: ['List-Unsubscribe']
  }
})
```

---

## API Reference

### `elxmail.init(config)`

Initialize the SDK. Validates config, frozen after init. Throws `ElxConfigError` on invalid config.

### `elxmail.send(email)`

Send a single email. Returns a Promise that resolves on success or rejects on permanent failure.

```js
await elxmail.send({
  to: 'john@gmail.com',
  from: 'hello@outreach1.com',     // optional, auto-generated from transport
  subject: 'Hi {{firstName}}',
  body: '<p>Hello {{firstName}}</p>',
  data: { firstName: 'John' },     // template variables
  replyTo: 'replies@outreach1.com',
  headers: { 'X-Campaign-ID': 'q3-2026' }
})
```

### `elxmail.sendBatch(emails)`

Send multiple emails. Accepts everything immediately, processes intelligently.

```js
const result = await elxmail.sendBatch(emailArray)
// { total: 5000, sent: 4980, failed: 20, results: [...] }
```

### `elxmail.validateDNS()`

Check SPF, DKIM, DMARC, rDNS for all configured domains.

```js
const report = await elxmail.validateDNS()
```

### `elxmail.testConnection(domain?)`

Test SMTP connectivity for one domain or all.

```js
const result = await elxmail.testConnection('outreach1.com')
// { status: 'connected', latency: '45ms', host: '1.2.3.4' }
```

### `elxmail.scoreContent(email)`

Score email content for spam likelihood (0-100, higher is better).

```js
const { score, issues } = elxmail.scoreContent({
  subject: 'Quick question',
  body: '<p>Hi {{name}}</p>'
})
```

### `elxmail.suppress`

| Method | Description |
|---|---|
| `add(email, reason?)` | Manually suppress an email |
| `check(email)` | Returns `true` if suppressed |
| `remove(email)` | Remove from suppression |
| `import(emails, reason?)` | Bulk import |
| `export()` | Export all entries |
| `size` | Total count (getter) |

### `elxmail.queue`

| Method | Description |
|---|---|
| `status` | Queue status (active, queued, ready, stats) |
| `pause()` | Pause processing |
| `resume()` | Resume processing |
| `drain()` | Returns Promise that resolves when queue is empty |

### `elxmail.warmup.status()`

Returns per-domain warm-up state.

```js
{
  'outreach1.com': {
    day: 7,
    currentLimit: 100,
    sent: 65,
    remaining: 35,
    health: 'good',
    warmupComplete: false
  }
}
```

### `elxmail.analytics`

| Method | Description |
|---|---|
| `summary(opts?)` | Aggregate stats with rates |
| `byDomain(domain, opts?)` | Per-domain breakdown |
| `byProvider(provider, opts?)` | Per-provider breakdown |
| `byIP(ip, opts?)` | Per-IP breakdown |
| `timeSeries(opts?)` | Time-bucketed data |

Options: `{ from, to, period: 'today' | 'week' | 'month' }`

### `elxmail.utils.generateDKIMKeyPair()`

Generates an RSA 2048-bit key pair for DKIM signing.

```js
const { publicKey, privateKey } = elxmail.utils.generateDKIMKeyPair()
```

### `elxmail.shutdown()`

Cleanly shuts down all components, closes connections, releases resources.

---

## Events

elxmail emits events for every lifecycle stage. Listen with `elxmail.on(event, fn)`.

| Event | When | Payload |
|---|---|---|
| `sent` | Email accepted by recipient server | `{ to, domain, ip, provider, messageId, trackingId, timestamp }` |
| `delivered` | Confirmed delivery (if tracking) | `{ to, domain, timestamp }` |
| `bounced` | Any bounce (hard or soft) | `{ type, category, email, domain, code, message, timestamp }` |
| `bounce:hard` | Permanent failure (auto-suppressed) | Same as `bounced` |
| `bounce:soft` | Temporary failure (auto-retried) | Same as `bounced` |
| `complained` | Spam complaint received (auto-suppressed) | `{ email, provider, feedbackType, timestamp }` |
| `opened` | Recipient opened the email | `{ trackingId, ip, userAgent, timestamp }` |
| `clicked` | Recipient clicked a link | `{ trackingId, url, ip, userAgent, timestamp }` |
| `failed` | Permanent send failure | `{ to, error, code, timestamp }` |
| `throttle:limit` | Rate limit hit | `{ domain, ip, provider, reason, waitMs }` |
| `throttle:cooldown` | Transport paused due to errors | `{ transport, pauseMinutes, resumeAt }` |
| `warmup:limit` | Warmup limit reached for a domain | `{ domain, currentDay, dayLimit, sentToday }` |
| `dns:warning` | DNS health changed | `{ domain, check, previousStatus, currentStatus }` |
| `queue:drained` | Queue is empty + no active sends | — |

Wildcard support: `elxmail.on('bounce:*', fn)` matches both `bounce:hard` and `bounce:soft`.

---

## Architecture

elxmail is structured in **5 layers** with **13 components**:

```
┌─────────────────────────────────────────────────────────────┐
│ LAYER 1 — API SURFACE                                        │
│   init() · send() · sendBatch() · validateDNS()             │
├─────────────────────────────────────────────────────────────┤
│ LAYER 2 — PRE-PROCESSING                                     │
│   Config Manager  · DNS Validator                           │
│   Suppression     · Provider Classifier                     │
├─────────────────────────────────────────────────────────────┤
│ LAYER 3 — ORCHESTRATION ENGINE                               │
│   Queue Manager   · Warm-up Scheduler                       │
│   Throttle        · Rotation Engine                         │
├─────────────────────────────────────────────────────────────┤
│ LAYER 4 — DELIVERY                                           │
│   Transport (SMTP, Relay, Cloud Provider) · DKIM Signer     │
├─────────────────────────────────────────────────────────────┤
│ LAYER 5 — FEEDBACK & DATA                                    │
│   Bounce Processor · FBL Handler                            │
│   Analytics        · Logger                                  │
└─────────────────────────────────────────────────────────────┘
              ↑                                ↓
              └─── feedback loop (auto-suppression) ───┘
```

**The flow when you call `send()`:**

```
send(email)
  → Suppression check         (skip if blacklisted)
  → Provider classifier       (gmail / outlook / yahoo / corporate)
  → Queue manager             (enqueue with priority)
  → Warm-up scheduler         (allowed today?)
  → Throttle controller       (within rate limits?)
  → Rotation engine           (pick best transport)
  → DKIM signer               (sign with domain key)
  → Transport                 (SMTP send)
  → Bounce processor          (parse response)
  → Analytics                 (record event)
```

---

## FAQ

**Q: Do I need to manage DNS records myself?**
Yes. elxmail validates them but doesn't publish them. You configure SPF, DKIM, DMARC, and rDNS through your domain registrar and VPS provider. elxmail provides a DKIM keygen helper.

**Q: Can I use elxmail with my existing nodemailer setup?**
elxmail uses nodemailer internally for the actual SMTP transport. You don't need separate nodemailer code.

**Q: What about transactional emails?**
elxmail is optimized for cold outbound, but the same engine works for transactional. Just disable warm-up and set higher rate limits.

**Q: Does elxmail handle email replies / inbound?**
No. elxmail is outbound-only. For inbound, configure your MX records to a separate inbox or service.

**Q: What if a recipient unsubscribes?**
Add them to suppression: `elxmail.suppress.add(email, 'unsubscribe')`. They'll never be contacted again.

**Q: Can I run elxmail on serverless (AWS Lambda, Cloudflare Workers)?**
Not recommended. elxmail maintains in-memory state (queue, throttle counters, warm-up tracker, connection pools) that doesn't survive cold starts. Use a long-running VPS or container.

**Q: How do I scale beyond 50,000 emails/day?**
Run multiple elxmail instances on separate VPS nodes, each managing a subset of your domains. Use Redis adapters (coming in v0.2) to share suppression and analytics state.

---

## License

MIT

## Status

**v0.1.0** — Functional, all 13 components built, 44 tests passing. Production-ready for self-hosted deployments.

Persistent adapters: SQLite ✓, Redis (planned), PostgreSQL (planned).
Cloud provider adapters: SES, SendGrid, Mailgun ✓.
TypeScript definitions: Coming.
# elxmail
