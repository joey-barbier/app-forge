# Security — User-Supplied URLs (SSRF Defense)

Any feature that makes the server fetch a URL a user typed — webhooks, callbacks, OAuth
redirect targets, RSS/file imports, link previews, "test my endpoint" buttons — is an SSRF
vector. An attacker who controls the URL controls where YOUR server sends requests: cloud
metadata endpoints (instance credentials), internal databases, admin panels, the container
host. This doc is the mandatory checklist. Skipping a step is a security bug, not a style choice.

## Threat model (30 seconds)

| Target | Payoff for attacker |
|---|---|
| `169.254.169.254` (cloud metadata) | Steals instance IAM credentials → full cloud takeover |
| `localhost:<port>` / loopback | Hits DB, cache, admin APIs bound to loopback "safely" |
| RFC 1918 ranges | Scans and attacks the internal network from inside |
| `host.docker.internal` etc. | Escapes container network isolation toward the host |

## The validation pipeline — exact order, no reordering

Order matters: every bypass in the test-vector table below exploits a check done before
normalization, or a blocklist consulted before the host is in canonical form.

1. **Parse with a real URL parser, then normalize.** Never regex the raw string.
   - Take `url.host` from the parser — this defuses userinfo tricks
     (`https://trusted.example@10.0.0.1/` → host is `10.0.0.1`, not `trusted.example`).
   - Percent-decode the host (`127.0.0.%31` → `127.0.0.1`; fully-encoded `localhost`).
   - Lowercase. Strip IPv6 brackets and zone IDs (`fe80::1%eth0` → `fe80::1`).
   - Reject empty/missing host.
2. **Scheme allowlist: `https` only.** Not a denylist — `http`, `file`, `ftp`, `gopher`,
   `dict` are all useful to attackers. Check the parsed scheme, not a string prefix.
3. **Classify the host and reject forbidden destinations** (table below). The host may be:
   - a dotted-quad IPv4 → check against forbidden ranges;
   - an IPv4 in disguise — **hex** (`0x7f000001`), **octal** (`017700000001`),
     **decimal** (`2130706433`), **dotted-octal/hex** (`0177.0.0.1`, `0x7f.0.0.1`) —
     decode to a real IPv4, then check the ranges;
   - an IPv6 literal → check v6 ranges; for **IPv4-mapped** (`::ffff:127.0.0.1`) extract
     the embedded IPv4 and recurse into the IPv4 check;
   - a hostname → blocklist literal internal names (`localhost`, `*.docker.internal`,
     `metadata.google.internal`), then **resolve it and validate every returned A/AAAA
     record** against the same ranges. Validating only the hostname string is not enough.
4. **Enforce at request time (IO boundary):**
   - hard timeout per request (≈10 s) — connect AND total;
   - response-size cap (≈100 KB for webhook acks) — streaming-aware where the client
     allows it, so the cap limits allocation, not just post-read processing;
   - **no redirect following** — or re-run steps 1–3 on every `Location` before following.
     Configure this explicitly and pin it with a test; never rely on a client's default.

## Forbidden destinations

| Range / host | Why |
|---|---|
| `0.0.0.0/8`, `127.0.0.0/8` | "this host" + loopback (any `127.x.y.z`, not just `.0.0.1`) |
| `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` | RFC 1918 private |
| `100.64.0.0/10` | Carrier-grade NAT (often internal in cloud VPCs) |
| `169.254.0.0/16` | Link-local — includes `169.254.169.254` (AWS/GCP/Azure metadata) |
| `100.100.100.200` | Alibaba Cloud metadata |
| `::1/128`, `::/128` | IPv6 loopback / unspecified |
| `fc00::/7` | IPv6 unique-local (ULA) |
| `fe80::/10` | IPv6 link-local (strip zone ID first) |
| `::ffff:0:0/96` | IPv4-mapped — extract embedded IPv4, recurse |
| `64:ff9b::/96` | NAT64 — extract embedded IPv4, recurse |
| `fd00:ec2::254` | AWS metadata over IPv6 |
| `localhost`, `*.docker.internal`, `metadata.google.internal` | Literal internal hostnames |

`::ffff:8.8.8.8` and other public IPs stay **allowed** — block by classification,
not by syntax shape.

## Where it lives in the layers (see ARCHITECTURE_PRINCIPLES.md)

| Brick | Layer | Rule |
|---|---|---|
| `UrlSecurityValidator` — parse, normalize, decode IP forms, range classification | **L3 Core Logic** | Pure functions, zero IO. `(String) → Result`. Exhaustively unit-tested against the vector table in milliseconds. |
| `HostResolving` contract (DNS lookup interface) | **L3** (contract) | Validator takes it injected; tests use a fake resolver. |
| `HostResolving` impl + the outbound HTTP client wrapper (timeout, size cap, redirect policy) | **L2 Data** | The one sanctioned upward arrow: L2 implements the L3 contract. |
| Endpoint that accepts the URL (create webhook, import feed…) | **L5** | Calls the L3 validator before anything is persisted. L2 repositories store only already-validated URLs. |

Two hard rules:
- **One choke point.** Every outbound request to a user-supplied URL goes through a single
  L2 client wrapper that applies timeout + cap + redirect policy. Per-provider copies drift.
- **Validate at write time AND at send time.** A URL validated at creation can sit in the
  DB for months; ranges and blocklists evolve. Re-validate before each dispatch — it's pure
  L3 logic, it costs microseconds.

> 📖 **War story:** a production team shipped webhook support with the SSRF validation
> embedded in the L2 repository and the timeout helper copy-pasted into each provider
> client. Symptom: security tests needed a live database to run, and one provider client
> silently lacked the size cap. Cause: validation logic and IO enforcement were fused in L2.
> Fix: extract the validator to L3 (pure, contract-injected resolver), route all dispatch
> through one L2 wrapper — test suite dropped from integration-only to instant unit tests.

> ⚠️ **Gotcha:** "our HTTP client doesn't follow redirects by default" written in a comment,
> enforced nowhere. Symptom: none — until a client-library upgrade flips the default and a
> `302` from a public URL lands on the metadata endpoint. Cause: relying on an undocumented
> default. Fix: set the redirect policy explicitly in the L2 wrapper config and add a test
> that asserts a redirecting stub is NOT followed.

## Open-limitations register — mandatory section

A security doc that lists only what it blocks is marketing. List what it does **not**
defend; honest limits beat false confidence. The curated register below ships with this
template and is refreshed by `update --apply` — **do not edit it in place** (your changes
would be overwritten). When YOUR project carries an SSRF limitation specific to its design
(a domain allowlist you added, an egress rule you rely on, a pin you couldn't implement),
record it in the **gotchas log in `.claude/memory/PROJECT_STATE.md`** and in
`.claude/memory/DECISIONS.md` — those files are yours and `update` never touches them.

| # | Limitation | Status |
|---|---|---|
| 1 | **DNS rebinding (TOCTOU):** host resolves public at validation, private at request time (attacker controls a low-TTL record). Even resolve-and-validate doesn't close this — only *pinning*: connect to the exact IP you validated (resolver-level pin or custom connect), with correct TLS SNI/hostname verification. | Open unless IP-pinning is implemented. Document it either way. |
| 2 | **Redirect re-validation:** if any redirect following is ever enabled, each hop is a fresh SSRF unless re-validated. | Closed only by no-redirect or per-hop re-validation. |
| 3 | **Exotic IP encodings** beyond the tested set (mixed dotted-octal/hex variants differ per OS resolver). Decode-then-classify covers the known set; new forms appear. | Mitigated, not proven complete. |
| 4 | **Validated-then-stored drift:** DB rows validated under an older blocklist. | Closed by re-validation at send time (rule above). |
| 5 | **Outbound network egress** is application-level only. Defense in depth = also restrict egress at the network layer (no route to metadata/VPC ranges from app nodes). | Out of scope for app code; flag to ops. |

## Test vectors — the unit-test table for the L3 validator

Every row is one test case. All rejects must fail validation; all allows must pass.

| Vector | Input | Expected |
|---|---|---|
| Scheme not https | `http://example.com/hook`, `file:///etc/passwd` | reject |
| Localhost literal | `https://localhost/hook` | reject |
| Loopback range | `https://127.0.0.1/`, `https://127.5.6.7/` | reject |
| This-host | `https://0.0.0.0/` | reject |
| Decimal IP | `https://2130706433/` (= 127.0.0.1) | reject |
| Hex IP | `https://0x7f000001/` | reject |
| Octal IP | `https://017700000001/` | reject |
| Dotted-octal | `https://0177.0.0.1/` | reject |
| Private v4 | `https://10.0.0.1/`, `https://172.16.0.1/`, `https://192.168.1.1/` | reject |
| CGNAT | `https://100.64.0.1/` | reject |
| Metadata | `https://169.254.169.254/`, `https://100.100.100.200/` | reject |
| IPv6 loopback | `https://[::1]/`, `https://[0:0:0:0:0:0:0:1]/` | reject |
| IPv4-mapped private | `https://[::ffff:127.0.0.1]/`, `https://[::ffff:10.0.0.1]/` | reject |
| IPv4-mapped public | `https://[::ffff:8.8.8.8]/` | allow |
| IPv6 ULA / link-local | `https://[fd00::1]/`, `https://[fe80::1]/` | reject |
| Zone ID strip | `https://[fe80::1%25eth0]/` | reject |
| AWS v6 metadata | `https://[fd00:ec2::254]/` | reject |
| Percent-encoded octet | `https://127.0.0.%31/` | reject |
| Percent-encoded host | `https://%6c%6f%63%61%6c%68%6f%73%74/` (= localhost) | reject |
| Userinfo trick | `https://trusted.example@10.0.0.1/` | reject |
| Docker host | `https://host.docker.internal/` | reject |
| Hostname → private (fake resolver) | `https://internal.example/` → resolves `10.0.0.5` | reject |
| Public hostname | `https://hooks.example-saas.com/T123/B456` | allow |
| Public IP | `https://8.8.8.8/hook` | allow |

For high-trust contexts (e.g. {{PROJECT_NAME}} only ever calls two known SaaS webhook
hosts), add a **domain allowlist** on top of — never instead of — this pipeline.

## References

- OWASP SSRF Prevention Cheat Sheet; OWASP Top 10 A10:2021 (SSRF)
- RFC 1918 (private IPv4), RFC 4193 (IPv6 ULA), RFC 4291 (IPv6 addressing)
