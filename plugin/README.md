# HECATE skills

Claude skills that plan through HECATE's MCP tools instead of local markdown
files.

| Skill | Use it to |
|---|---|
| `hecate-focus` | Draft or refresh the week's focus, and wrap up the day (EOD) |
| `hecate-meeting` | Turn a meeting into a summary, tasks, people and terms |
| `hecate-log` | Record what changed this session in the activity log |

Every skill reads through the MCP tools and writes only through `apply_ops`:
a dry run first, then the same change once you confirm. The vocabulary (tags,
activity areas, statuses, people, the sprint cadence) comes from your
workspace, so nothing personal lives in these files.

They need the HECATE connector: the deployed Worker's `/mcp`
([`docs/v2/DEPLOY.md`](../docs/v2/DEPLOY.md), step 7).

## Claude Code

Install the plugin from this repository. It brings the skills and the
connector together:

```bash
claude plugin marketplace add carlofigs/HECATE
```

```bash
claude plugin install hecate@hecate
```

The connector's URL comes from the environment, so it never sits in this
repository. Set it before starting Claude Code (e.g. in your shell profile):

```bash
export HECATE_MCP_URL=https://hecate-preview.<subdomain>.workers.dev/mcp
```

Then `/mcp` signs you in to HECATE (GitHub) the first time.

## claude.ai and Cowork

Build one zip per skill:

```bash
pnpm package-skills
```

Upload each zip from `plugin/dist/` under **Settings → Capabilities →
Skills**, and add the HECATE custom connector (**Settings → Connectors**) if
you haven't already.

## During beta

Your current skills (focus-drafter, meeting-pipeline, log-update) keep working
on the markdown files until cutover. These have different names, so both can
be installed. Mention HECATE ("update my HECATE focus") to reach these. At
cutover, remove the old skills.
