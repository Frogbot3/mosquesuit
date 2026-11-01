# Phase 7 performance and recovery measurements

Prepared 1 November 2026. Raw execution timestamps are retained in the evidence files (the benchmark host recorded 31 October). These are development-computer measurements, not hardware-independent guarantees.

## Machine and method

Intel Core i7-12650HX, 20 logical CPUs, 11.7 GiB RAM, Windows x64 build 10.0.26300. Electron 45.0.0 with embedded Node 24.22.0; host Node 24.18.0. The existing user desktop applications were left running. Benchmark and load suites ran sequentially without other agent-started heavy test suites. Ordinary desktop activity and antivirus/cache effects were not controlled.

Each isolated dataset has four wards, five members per family, eleven pre-generated months, four payments per family, a donation, an approved expense, 23 life events, an attachment, pending notifications and audit history. December is generated during measurement, producing **6,000/24,000 dues and 2,000/8,000 payments** for 500/2,000 families. Test data never replaces an existing user profile.

The same closed pristine databases are copied into exclusive run directories. Read operations use five samples; login uses three; mutations, PDF, backup, restore and UI runs use one. The tables use medians; the JSON preserves every sample and its maximum-like small-sample p95. Do not interpret this p95 as a statistically stable population percentile. No OS cache flush was attempted: database-open is not a cold-disk benchmark, and fresh-process launch includes Electron/Playwright launch overhead. UI timings are observations, not enforced service-level objectives.

The original implementation was frozen before optimization in a local bundled harness (SHA-256 `742267f19bdf104984294670d54007b7aa507daa6f8d7e60edb4dad4707e7062`). Phase 6 source reference: `5484153e354b2c47fc4847486bf34ae186bb966b`. Final comparison uses `baseline-v2` and `optimized-v1`. An earlier harness called a nonexistent audit method; that run is excluded. Initial unoptimized 2,000-family seeding exceeded 17 minutes and was stopped; its partial fictional directory was preserved. Optimized fixture construction took 112.9 seconds. Fixture creation is excluded from query/launch timings; no precise seeding speedup is claimed.

## Service measurements, milliseconds

| Operation | 500 before | 500 after | 2,000 before | 2,000 after |
| --- | ---: | ---: | ---: | ---: |
| Database open | 15.27 | 10.68 | 19.44 | 16.47 |
| Offline password verification | 88.18 | 104.28 | 132.18 | 146.57 |
| Registry dashboard counts | 1.23 | 1.35 | 4.71 | 5.08 |
| Family search | 2.20 | 1.89 | 13.17 | 8.71 |
| Malayalam family search | 1.98 | 1.73 | 7.56 | 5.89 |
| Member search | 2.65 | 2.44 | 12.33 | 10.34 |
| One family financial summary | 5.57 | 2.47 | 19.51 | 5.15 |
| Generate December dues (one run) | 603.90 | 645.85 | 7429.94 | 7153.52 |
| Duplicate dues attempt (one run) | 264.02 | 186.89 | 1964.62 | 1173.14 |
| Financial dashboard | 56.19 | 51.61 | 403.62 | 401.64 |
| Monthly report | 52.66 | 47.47 | 407.22 | 352.65 |
| Outstanding report | 68.84 | 47.44 | 1012.34 | 356.34 |
| Ledger report | 64.21 | 45.29 | 351.01 | 369.39 |
| Audit history page | 2.97 | 2.08 | 6.48 | 13.77 |
| Encrypted backup (one run) | 928.17 | 1043.18 | 2647.91 | 2641.05 |
| Restore preview (one run) | 393.38 | 402.61 | 1377.20 | 1199.61 |
| Restore including safety copy (one run) | 592.38 | 575.37 | 967.67 | 1203.38 |

The measured 2,000-family outstanding report improved from 1,012.34 to 356.34 ms (about 65% less time), and a family financial summary from 19.51 to 5.15 ms (about 74% less). Ledger, audit, login and restore figures show variation or regressions; they are retained above rather than presented as universal improvements. Monthly dues generation still takes roughly seven seconds for 2,000 families.

## Changes supported by the measurements

- Family/transaction-specific finance queries now use bound equality predicates instead of optional-parameter OR clauses, allowing the existing indexes to be useful. No migration or historical financial data was changed.
- Authorization refresh reads the current finance role directly instead of rebuilding the complete setup/fund/plan response on every call.
- Dues generation caches effective-date plans within one transaction and reads family assignments once per family.
- Outstanding/overdue reports group dues in one pass rather than repeatedly filtering the entire array for each household.
- Registry and financial tables already paginate at 10 and 25 rows respectively. They retained stable pagination in the load tests. Financial callers still format all report rows: UI timings below do not justify an unmeasured virtualization rewrite in this phase. Further query pagination/background main-process work is a Phase 8 option for larger workloads.

## Real Electron workload, milliseconds unless stated

| Observation | 500 families / 2,500 members | 2,000 families / 10,000 members |
| --- | ---: | ---: |
| Fresh Electron process to first screen | 36712 | 2792 |
| Dashboard visible after login helper returns | 168 | 114 |
| Family directory, 10 rows | 938 | 239 |
| Member directory, 10 rows | 12 | 14 |
| Ledger/date filters, first 25 rows | 1480 | 1150 |
| Generate December dues through IPC | 3047 | 7736 |
| Bilingual twelve-month PDF | 506 | 600 |
| 16 ms renderer timer callbacks during dues (count) | 180 | 483 |

The dashboard figure starts after the authentication helper returns, so it excludes the password operation; password verification is measured separately above. The original screenshot run observed a 10,184 ms first launch at 500 and 1,001 ms at 2,000. The final repeat above is not evidence that more records make startup faster: process/cache/scheduling variance dominates this single observation. No pre-optimization UI comparison is claimed.

During synchronous main-process dues generation the independent renderer continued its 16 ms timer; this demonstrates renderer event-loop progress, not guaranteed uninterrupted IPC responsiveness. The main process still serializes heavy database work. Backup processing also has memory costs and a documented 256 MiB archive/snapshot bound.

| Dataset families | Sum of sampled process working sets, MiB | Main-process peak working set, MiB |
| --- | ---: | ---: |
| 500 | 615.8 | 334.7 |
| 2000 | 671.4 | 603.2 |

The process working-set sum can count shared pages more than once. It is not unique application RAM. Service-harness RSS/heap and process peaks are in the raw JSON; the second dataset's harness peak is cumulative across both datasets and should not be interpreted as an independent run peak.

## Offline, display and recovery evidence

Both workloads run with renderer networking offline, use the real IPC/SQLite/PDF pipeline, leave queued notifications unconfirmed, check actual second-page results and assert no console/page errors. Scaled layouts request 1366×768 at 1.0, 1536×864 at 1.25 and 1920×1080 at 1.5 Electron zoom. Actual native bounds, effective renderer dimensions and device-pixel ratios are recorded in the UI JSON. This is **zoom/layout coverage, not native Windows DPI certification**. Native Electron captures are used because CDP screenshots misplaced scrolled content at non-unit zoom. All six captures and both one-page PDFs were reviewed; native DPI and physical printing remain staff checks.

The two PDFs embed Noto Sans Malayalam regular/semibold subsets, retain extractable Malayalam text and have no replacement characters. PDF inspection uses [PyMuPDF font extraction](https://pymupdf.readthedocs.io/en/latest/document.html#Document.extract_font) and rendered pages, not a text-only layout assertion. The app itself generates the PDFs offline through Electron.

Both before/after benchmark runs restored each size into a fresh profile with the original withheld. Family/member/payment/receipt/event/attachment/notification counts, integer-paise balances, schema checks, SQLite integrity and audit chains matched. The focused recovery tests additionally verify exact attachment bytes, pending jobs, paired service integrity, wrong passwords/corrupt archives (existing suite), injected disk-full safety-copy failure and abrupt-process transaction rollback. Recovery timings above exclude human password entry, archive transport and post-restore staff verification.

## Reproduce

```powershell
npm.cmd run qa:benchmark -- review-01
npm.cmd run qa:load
npm.cmd test -- tests/unit/pilot-recovery.test.ts tests/unit/accounting-invariants.test.ts
```

Use a new benchmark label each time; existing runs are intentionally not overwritten. A clean checkout generates fixtures before measuring. To compare older code, use an isolated checkout at the recorded reference with the same harness and pristine fixtures; do not replace files in an active user workspace. Raw evidence: [baseline](phase7-evidence/baseline.json), [optimized](phase7-evidence/optimized.json), [500-family UI](phase7-evidence/ui-500.json), [2,000-family UI](phase7-evidence/ui-2000.json), [font inspection](phase7-evidence/pdf-inspection.json).
