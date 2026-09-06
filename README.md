# lives-on.dev registry

Free subdomain requests for personal, non-commercial developer projects.
Maintained by [Bhavesh Chawla](https://github.com/Bhav3shChawla).

**Bootstrapping:** DNS publication and public registration are not yet live.
Do not treat a JSON file or a pending request as proof that DNS is active.

## Request structure

Each request lives at `registry/domains/name.json`:

```json
{
  "owner": { "username": "your-github-username", "id": 123 },
  "records": { "CNAME": "your-host.example.com" },
  "proxied": false
}
```

Replace all example values. Include the stable numeric GitHub user ID when
submitting through the site. Do not commit passwords, API tokens, email addresses,
or other private information. DNS records and review discussions are public.

## Review

1. Submit through the website or open a pull request.
2. Automated checks validate record values and reserved names.
3. The maintainer verifies GitHub identity, destination control and eligibility.
4. The maintainer comments `/approve FULL_HEAD_COMMIT_SHA` on the PR.
5. Merge only after both checks pass. Approval is tied to the exact commit.
6. Run the DNS workflow, inspect its diff, and approve the deployment environment.

No automation in the website merges pull requests.
New names, updates, removals and emergency suspensions use reviewed changes.
Reverting a registry change and publishing a new reviewed plan restores its records.

## Local checks

```sh
node scripts/validate-registry.mjs
node --test scripts/validate-record.test.mjs
```

DNS tooling only manages exact subdomains carrying the comment
`lives-on.dev:registry`. Existing root, wildcard and unrelated DNS records are
not deleted by the publisher. See [Operations](OPERATIONS.md).

## Policy and reporting

See [SERVICE_POLICY.md](SERVICE_POLICY.md). A monitored reporting address is still
being arranged; public registration remains closed until it is ready.
Public Suffix List inclusion has not been accepted.
