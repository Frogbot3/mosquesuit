# Indian privacy and deployment review

Reviewed 31 October 2026. This is an engineering readiness assessment, not a determination that a mosque's processing is lawful or that the product is certified compliant. Obtain organization-specific legal review before collecting real records.

The notified Digital Personal Data Protection Rules, 2025 use staged commencement: selected institutional rules apply on publication, Rule 4 after one year, and Rules 3, 5–16, 22–23 after eighteen months. The Act's commencement notification similarly stages substantive provisions. The Gazette documents are dated 13 November 2025; check publication records and subsequent notifications when deciding an actual deployment deadline. [Official Rules](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf), [official commencement notification](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf).

The Rules address clear notices, purpose-specific data descriptions, consent/withdrawal, safeguards, breach communication, children's consent, retention and individual rights. Offline storage alone does not resolve these obligations. The following is our implementation checklist inferred from those requirements and this application's data flows. [Official Rules](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf).

Before a real-data pilot, the mosque's responsible administrator must:

- Identify the responsible organization and public contact, processing purposes, applicable legal basis, retention periods and applicable exemptions with counsel.
- Approve understandable English/Malayalam notices. Existing messaging opt-in is not blanket permission for registry, divorce, identity, payment or child-data processing.
- Establish guardian verification and appropriate consent/authority for children's records. Do not collect identity scans merely to simplify verification.
- Provide a documented correction, access, withdrawal, erasure and grievance process. The app preserves transaction/audit history; resolve financial/legal retention conflicts before promising deletion. Automated rights fulfilment is not implemented.
- Classify restricted divorce and other private records, review staff grants periodically, and record departures promptly.
- Approve an incident response plan: detection, access containment, evidence preservation, affected-person communication, notification decisions and a supervised restore exercise.
- Review provider/processor contracts, international processing, webhook hosting, key rotation and consent before enabling external messaging/payments. These remain disabled here.
- Set retention for exports, attachments, audit logs, archives, old restore generations and paper copies. App retention covers recognized backup archives only.

Technical controls added in Phase 6 support this program: individual offline accounts, ward restrictions, explicit privileged authorization, restricted/masked identity references, export controls, append-only application audits and authenticated encrypted backups. Remaining controls include deployment-specific Windows ACLs and full-disk encryption, secure disposal, independent security review, organizational policies and real provider operational review. Local Windows administrators can read the working database and alter software or audit history. No cryptographic claim in this release eliminates that threat.

## Dependency review

The UUID advisory reported initially was addressed with an ExcelJS-scoped `uuid@11.1.1` override; CSV/XLSX regression tests exercise exported files. The later 31 October audit reports 20 moderate dependency findings and zero high/critical findings, propagated from [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). Its described trigger is attacker-controlled glob expansion with optimization level 2; minimatch 11.0.1 is the listed patched version.

Source inspection found minimatch in packaging tools and ExcelJS's archive dependencies. Mosque Suite exposes no renderer-supplied glob patterns or workbook imports; spreadsheet export writes generated worksheets. This reduces exposure but is not a clean dependency audit. Legacy consumers use incompatible minimatch API generations, and npm's forced suggestion downgrades ExcelJS/electron-builder. No forced downgrade or blanket major override was applied. A compatible upstream dependency update and packaging regression are required before production sign-off. Re-run `npm.cmd audit` when preparing a release; advisory counts can change.
