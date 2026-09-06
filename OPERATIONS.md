# Operations

The Free-plan DNS budget is 200 total records, including unmanaged root records.
The publisher stops before exceeding it.

Required repository variable: CLOUDFLARE_ZONE_ID.
Required repository secret: CLOUDFLARE_DNS_READ_TOKEN (DNS read for this zone only).
Required dns-production environment secret: CLOUDFLARE_DNS_TOKEN (DNS edit for this zone only).
The dns-production environment must require Bhav3shChawla's approval and only main.

Review both the registry commit and the generated DNS plan before approving.
Plans expire after one hour and refuse to apply if the live DNS snapshot changed.
An expired or stale plan requires a new workflow run, not bypassing validation.
An empty plan changes nothing.

Before each application the managed DNS state is backed up to a workflow artifact.
Retain an independent copy of these backups. A Cloudflare batch updates database
records transactionally, but propagation across DNS servers is not instantaneous.
Check authoritative DNS and HTTPS separately after publication.

For rollback, download the backup, run:

```sh
node scripts/dns-sync.mjs rollback-plan before-TIMESTAMP.json
node scripts/dns-sync.mjs apply dns-rollback-plan.json APPROVAL_DIGEST
```

Inspect the rollback plan first. Only managed records can be changed.
Also revert the corresponding registry change through review so the next publish
does not restore the unwanted configuration.

Emergency suspension: remove the exact affected domain file in a PR, approve
the head commit, merge, inspect the DNS plan and approve the publishing job.
Record the reason, affected names, timestamps and recovery decision in the PR.
Notify the owner when safe; restore only after the destination is verified.
