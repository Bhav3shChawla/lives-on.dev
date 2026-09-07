# lives-on.dev

### Your next idea lives here.

A free subdomain for your personal developer site, side project, documentation, or open-source work. Choose **`yourname.lives-on.dev`** and keep hosting wherever you like.

[Claim a name](https://lives-on.dev) · [Quickstart](https://lives-on.dev/docs/quickstart) · [Hosting guides](https://lives-on.dev/docs/guides) · [FAQ](https://lives-on.dev/faq) · [Edit your records](https://lives-on.dev/record/edit)

---

## What this is

lives-on.dev is a subdomain registry, not a hosting provider or a top-level domain. We provide the address; your provider runs your website.

This repository contains the approved public records in [`registry/domains/`](registry/domains/). Pending claims and drafts are stored by the website until reviewed. A saved claim is not an active DNS record.

**Public beta:** requests are manually reviewed before DNS publication. Check the website for current registration availability. The name is free; your hosting provider may charge for its services. Availability and permanent service are not guaranteed.

## Claim your name

1. Visit [lives-on.dev](https://lives-on.dev) and enter the name you want. Availability is checked before sign-in.
2. Sign in with GitHub to save an available name. One claim per GitHub account.
3. Add the full address to your hosting provider's custom-domain settings.
4. Open [Configure your DNS records](https://lives-on.dev/record/edit) and enter the exact records your host supplies.
5. **Save record**, then **Submit saved record for review**. Follow the linked GitHub request.
6. After approval and successful DNS publication, finish verification and HTTPS setup at your host.

Copying or downloading JSON does not submit or publish it. Do not treat a pending claim, merged request, or working default hosting URL as proof that the custom address is ready.

## Point it at your own hosting

Choose a guide for your provider:

- [Vercel](https://lives-on.dev/docs/guides/vercel)
- [Netlify](https://lives-on.dev/docs/guides/netlify)
- [GitHub Pages](https://lives-on.dev/docs/guides/github-pages)
- [Cloudflare Pages](https://lives-on.dev/docs/guides/cloudflare-pages)
- [Render](https://lives-on.dev/docs/guides/render)
- [Railway](https://lives-on.dev/docs/guides/railway)
- [Firebase Hosting](https://lives-on.dev/docs/guides/firebase-hosting)
- [Replit](https://lives-on.dev/docs/guides/replit)
- [Codeberg Pages](https://lives-on.dev/docs/guides/codeberg-pages)

The guides explain provider-specific verification and compatibility limits. Additional DNS labels may require maintainer coordination. You cannot verify ownership of the parent domain or change its nameservers.

## What a record looks like

An illustrative CNAME record at `registry/domains/yourname.json`:

```json
{
  "owner": {
    "username": "your-github-username"
  },
  "records": {
    "CNAME": "replace-with-provider-target.example"
  }
}
```

The destination above is a placeholder, not working hosting. Use the exact target supplied by your own provider. Published records can also include the owner's numeric GitHub ID.

- **CNAME:** a hostname, without `https://`, a port, or a path. It must be the only record type at that name.
- **A / AAAA:** IPv4 / IPv6 addresses supplied by your host.
- **TXT:** public verification values. Keep permanent verification records when your host requires them for certificate renewal.
- **Multiple records:** use the editor's Advanced mode for compatible records at your claimed name. Separate verification hostnames require review.

See the [record schema](registry/schema.json) and [hosting guides](https://lives-on.dev/docs/guides). DNS destinations and ownership identifiers are public. **Never submit passwords, API tokens, private keys, or private account information.**

## Rules and responsibilities

- Personal, non-commercial developer projects only. Your destination must contain meaningful, publicly reviewable content.
- Use accurate ownership information. Only the recorded owner may request changes to a registration.
- No phishing, malware, spam, impersonation, abusive content, resale, or other prohibited use.
- Keep your hosting and certificates working. Request DNS removal before abandoning the destination.
- The parent domain is not on the Public Suffix List. Do not set parent-domain cookies or interfere with other subdomains; shared-domain security limitations still apply.

Read the [service policy](SERVICE_POLICY.md), [website policy](https://lives-on.dev/policy), and [privacy notice](https://lives-on.dev/privacy). Requests can be declined, and harmful registrations can be suspended.

## Contributing

Found a documentation error or a registry problem? Open an issue with enough detail to reproduce it. For your own domain changes, use the signed-in editor so the request includes the correct ownership information. Keep proposed changes focused and never include credentials.

Report security vulnerabilities and abuse privately by email rather than posting sensitive details in a public issue.

## Report abuse or get help

Email **[reports@lives-on.dev](mailto:reports@lives-on.dev)** for abuse, security issues, privacy requests, or domain disputes. Include the affected address and relevant evidence, not passwords or private keys.

---

Built by [Bhavesh Chawla](https://github.com/Bhav3shChawla). Like the project? **[Star this registry on GitHub](https://github.com/Bhav3shChawla/lives-on.dev)** to show your support.
