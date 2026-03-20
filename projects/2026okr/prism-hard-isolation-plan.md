# Prism Hard Isolation Plan

## Objective

Keep Claude Code simple:

- Claude Code always points to one Prism entrypoint
- Prism controls which upstream is active
- Official Anthropic and each custom upstream do not share rate-limit buckets

## Claude Code Side

Keep a single stable Prism URL in Claude Code:

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "your_prism_token",
    "ANTHROPIC_BASE_URL": "https://cursor.scihub.edu.kg/api",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-sonnet-4-6",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "claude-opus-4-6",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "claude-haiku-4-5-20251001",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  }
}
```

Do not switch models or URLs in Claude Code unless Prism itself changes.

## Prism Isolation Rules

### 1. Separate upstream pools

Create one pool per upstream:

- `official_pool`
- `scihub_pool`
- `volc_pool`
- `minimax_pool`
- `foxcode_pool`

Each pool must use:

- its own upstream URL
- its own API key/token
- its own RPM limit
- its own TPM limit
- its own concurrency limit

### 2. No shared global rate-limit bucket

Do not let these pools consume from one common bucket.

Required behavior:

- `scihub_pool` hitting 429 must not reduce capacity for `official_pool`
- `official_pool` failures must not trigger throttling on `minimax_pool`

### 3. No automatic cross-upstream fallback

Disable automatic fallback between providers.

Required behavior:

- if `scihub_pool` returns 429, stay on `scihub_pool`
- if you want to switch, do it explicitly in Prism

### 4. Standard model names stay stable

Keep Claude Code sending standard model names:

- `claude-sonnet-4-6`
- `claude-opus-4-6`
- `claude-haiku-4-5-20251001`

Prism decides which upstream serves them.

## Minimal Switching Model

Use one Prism-side switch:

- `active_upstream = scihub`
- later switch to `official`
- later switch to `volc`

Routing rule:

- all standard `claude-*` models route to the current `active_upstream`
- the selected upstream uses only its own isolated bucket

## Initial Limits

Start conservatively:

- `official_pool`: concurrency `3`
- `scihub_pool`: concurrency `1`
- `volc_pool`: concurrency `1`
- `minimax_pool`: concurrency `1`
- `foxcode_pool`: concurrency `1`

Retry policy:

- max retries: `1`
- backoff: `2s`

## Required Observability

Prism logs should include:

- `timestamp`
- `model`
- `upstream`
- `status_code`
- `request_id`
- `bucket`
- `retry_count`

Without these fields, you cannot prove isolation is working.

## Validation Checklist

- Default Claude Code requests hit only the current Prism upstream
- Switching upstream in Prism does not require editing Claude Code settings
- A 429 on `scihub_pool` does not affect `official_pool`
- A 5xx on one custom upstream does not affect the others

