# Requirements and risk register

The table below preserves the Phase 1 baseline. [Phase 2 delivery](PHASE-2.md) adds family/member registration. The current [Phase 3 delivery](PHASE-3.md) adds life-event workflows, separate transfers, attachments and bilingual event output in an isolated fictional demo. Life-event operations are denied outside that demo because staff authorization is absent. Ward administration, security, recovery and release gates below still apply.

## Traceability

| Requirement group | Phase 1 result | Later acceptance gate |
| --- | --- | --- |
| Offline Windows stack | React/TS/Vite/Tailwind/Electron/SQLite working foundation | Clean-machine signed installer and updates |
| Accessible bilingual UI | Four working routes, saved locale/theme, local fonts, keyboard controls | Malayalam clerk review, paper/print fidelity, screen-reader/manual audit |
| Wards/families/members | Four initial ward records and searchable viewer | CRUD, guardian integrity, transfers, counts, DOB, ward history |
| Life events | Navigation marked planned | Confirmed transitions, sensitive permissions, historical retention |
| Payments/donations | Navigation marked planned | Paise arithmetic, immutable ledgers, receipt sequencing, duplicate prevention, reconciliation |
| Messaging/gateways | No network integration | Official consent/template workflow, retry/idempotency, signed/reconciled webhooks |
| Reports/documents/import | No output or migration claims | Bilingual PDFs, mosque-record wording, staged CSV/Excel and rollback |
| Security | Sandboxing, IPC validation, CSP and filesystem boundary | Auth/RBAC, ward scope, secure local credentials and lock |
| Recoverability | Atomic writes/migrations, read-only integrity check | Encrypted safe backups, manifests, restore preview and tested recovery |
| Configurable product | Single-mosque profile and four initial wards | Configurable plans/wards/branding, ownership export and signed updates |

## Risks

| ID | Risk / severity | Mitigation now | Gate / owner role |
| --- | --- | --- | --- |
| R1 | Sensitive data visible to another local user / critical | Persistent preview warning; no real-data import; no claim of authentication | Security: local auth, roles, lock and Windows deployment policy before pilot |
| R2 | Loss after drive failure or accidental replacement / critical | SQLite transactions, WAL/FULL, no restore or delete API | Recovery: encrypted online backup plus attachments and actual restore drills |
| R3 | Financial mistakes or duplicate collection / critical | No finance implementation in Phase 1 | Accounting: paise-based ledger, idempotency, reversals and independent reconciliation tests |
| R4 | Native dependency/installer failure / high | Pin lockfile, use SQLite Node-API binary, test real Electron and package | Release: clean Windows install/upgrade/uninstall matrix; sign binaries |
| R5 | Guardian/ward histories become inconsistent / high | Defer until transactional schema and transition design are reviewed | Registry: moves, guardian replacement, death and archive tests |
| R6 | Malayalam spelling, keyboard or paper mismatch / medium | Unicode round trips, bundled Noto Sans Malayalam, bilingual foundation UI | Product: Malayalam staff review and original blank paper form before Phase 3 |
| R7 | Malicious import/attachment/export disclosure / high | None accepted in this milestone | Data: bounded parser, formula injection defenses, authorization, path confinement, virus policy |
| R8 | Online credentials or unreliable sends / high | No secrets, network sends or cloud dependencies | Integrations: secure broker, official APIs, explicit opt-in and bulk approval |
| R9 | Local file tampering / high | Append-only app audit with no PII payloads | Security: OS access controls and tamper-evidence design; do not claim triggers resist an OS administrator |
| R10 | Privacy requirements misunderstood / high | No compliance claim, minimal fictional profile data | Mosque administrator + qualified adviser: law applicability, notices, retention, children's records and breach process |
| R11 | Network-share SQLite writes corrupt operations / high | Single local database/instance, documented restriction | Architecture: use a real service/database if multiple computers need concurrent access |
| R12 | Feature breadth hides incomplete behavior / high | Explicit phase scope and disabled future modules | Product: review milestone evidence before expanding scope |
| R13 | Unsaved form loss / medium | Dirty-route confirmation, discard controls, before-unload handling | UX: manual Windows close/lock flows before pilot |
| R14 | Malicious dependency/update / high | Pinned lockfile, restricted script policy, local bundles, no updater | Release: vulnerability checks and signed update provenance |

## Indian privacy review before using real data

This is an engineering readiness checklist, not legal advice or a determination that Mosque Suite complies with Indian law. The official [MeitY DPDP Rules 2025 page](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa?pageTitle=Digital-Personal-Data-Protection-Rules-2025%3B) includes the rules, enforcement timeline and related notifications. Check the provisions in force on the actual pilot date; phased commencement means a blanket statement that every provision already applies would be unreliable.

Before real collection, obtain qualified review of the mosque's role and applicable duties: understandable notices and lawful purpose; appropriate consent/withdrawal and distinct messaging opt-in; access/correction/erasure and grievance procedures; limited retention; children's data and guardian authorization; access safeguards and breach response; contracts with message/payment/hosting processors; and data ownership/export. Minimize collection from the outset. Aadhaar is not collected in this foundation; later consider only an optional restricted masked reference if justified, excluding it from routine exports/messages. Religious/community membership and life events require cautious access and retention even when a particular statutory category does not explicitly label them sensitive.

## Product decisions still needed for later phases

Use fictional data until the security and recovery gates pass. Before Phase 2/3 confirm the actual ward names, household numbering convention, supported relationships, and guardian replacement rules; obtain a blank registration form (without personal data) for print layout. Before finance, obtain approved rate/waiver/receipt/reversal policies. Before messaging, confirm account ownership, opt-in sources and approved templates. These do not block Phase 1.

## Phase 4 financial demo update

Version 0.4.0 implements the offline accounting module in an isolated fictional workspace. Main-process simulated role permissions, immutable postings, audit/session identifiers and consistent unencrypted SQLite snapshots are implemented. These do not satisfy the production login, ward scope, encryption, recovery or signed-distribution gates. No online payment verification or messaging is present. See [Phase 4 accounting policies and limits](PHASE-4.md).

## Phase 5 integration simulation update

Version 0.5.0 adds the isolated integration profile, explicit guardian consent, offline approval queue, minimal synchronized data, signed verified mock payments, single-authority reconciliation, receipt delivery and scheduling. The standalone service owns provider test adapters and secrets. No real provider activation, public deployment or live transactions were authorized or performed. Staff authentication, secure hosted-service pairing, real provider acceptance, settlement/bank reconciliation, retention, encrypted paired recovery and signed distribution remain production gates. See PHASE-5.md.
