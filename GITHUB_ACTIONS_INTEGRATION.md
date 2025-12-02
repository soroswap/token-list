# GitHub Actions Integration

This document describes how to integrate the `soroswap/token-list` repository with the indexer to automatically sync token list changes.

## Overview

When tokens are added or removed from the Soroswap token list, a GitHub Action in the `soroswap/token-list` repository should call the indexer API to sync the changes to the database.

## Endpoint

### `POST /api/token-lists/soroswap/sync`

Syncs the Soroswap token list from the canonical `tokenList.json`.

**Authentication**: `x-github-key` header with the GitHub Actions API key

**Request Body**: Full `tokenList.json` content

**Example Request**:
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "x-github-key: YOUR_GITHUB_API_KEY" \
  -d @tokenList.json \
  https://your-indexer-url.com/api/token-lists/soroswap/sync
```

**Success Response** (200):
```json
{
  "success": true,
  "list_id": "soroswap",
  "version": "1.3.4",
  "processed": {
    "tokens": 33,
    "lists": 1,
    "memberships": 33
  },
  "processingTimeMs": 150
}
```

**Error Responses**:
- `401 Unauthorized`: Missing or invalid API key
- `400 Bad Request`: Invalid payload structure
- `500 Internal Server Error`: Database or processing error

## Setup for soroswap/token-list Repository

### 1. Add Repository Secret

Add the indexer GitHub API key as a repository secret:

1. Go to `soroswap/token-list` repository settings
2. Navigate to **Secrets and variables** > **Actions**
3. Click **New repository secret**
4. Name: `INDEXER_GITHUB_API_KEY`
5. Value: The GitHub API key from the indexer configuration

### 2. Modify GitHub Actions Workflow

Update `.github/workflows/update-token-list.yml` to call the indexer after merging the token list:

```yaml
name: Update Token List

on:
  push:
    branches:
      - main
    paths:
      - 'assets/**'

jobs:
  update-token-list:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: yarn install

      - name: Merge token lists
        run: yarn merge

      - name: Commit updated tokenList.json
        run: |
          git config --local user.email "github-actions[bot]@users.noreply.github.com"
          git config --local user.name "github-actions[bot]"
          git add tokenList.json
          git diff --staged --quiet || git commit -m "chore: update tokenList.json"
          git push

      - name: Sync to Indexer
        run: |
          response=$(curl -s -w "\n%{http_code}" -X POST \
            -H "Content-Type: application/json" \
            -H "x-github-key: ${{ secrets.INDEXER_GITHUB_API_KEY }}" \
            -d @tokenList.json \
            https://your-indexer-url.com/api/token-lists/soroswap/sync)

          http_code=$(echo "$response" | tail -n1)
          body=$(echo "$response" | sed '$d')

          echo "Response: $body"
          echo "HTTP Status: $http_code"

          if [ "$http_code" != "200" ]; then
            echo "Failed to sync to indexer"
            exit 1
          fi
```

### 3. Environment-Specific URLs

For different environments, you may want to use environment variables or secrets for the indexer URL:

```yaml
- name: Sync to Indexer
  env:
    INDEXER_URL: ${{ secrets.INDEXER_URL || 'https://indexer.soroswap.finance' }}
  run: |
    curl -X POST \
      -H "Content-Type: application/json" \
      -H "x-github-key: ${{ secrets.INDEXER_GITHUB_API_KEY }}" \
      -d @tokenList.json \
      "${INDEXER_URL}/api/token-lists/soroswap/sync"
```

## Payload Schema

The endpoint expects the standard `tokenList.json` format:

```typescript
interface TokenListPayload {
  name: string;              // "Assets curated by Soroswap Protocol"
  provider: string;          // "Soroswap Protocol"
  description?: string;
  version: string;           // Semantic version, e.g., "1.3.4"
  feedback?: string;
  network: string;           // "mainnet"
  assets: Array<{
    code: string;            // Token symbol, e.g., "USDC"
    issuer?: string;         // Stellar issuer (G... address), optional
    contract: string;        // Soroban contract (C... address)
    name?: string;           // Full name, e.g., "USD Coin"
    org?: string;            // Organization, e.g., "Centre Consortium LLC"
    domain?: string;         // e.g., "circle.com"
    icon?: string;           // Icon URL
    decimals: number;        // Token decimals, e.g., 7
  }>;
}
```

## Sync Behavior

The sync operation performs a **full replace**:

1. All tokens in the payload are upserted (created or updated)
2. The token list metadata is updated
3. All existing token list memberships for `soroswap` are deleted
4. New memberships are created for all tokens in the payload

This ensures the database always reflects the exact state of `tokenList.json`.

## Troubleshooting

### 401 Unauthorized
- Verify the `INDEXER_GITHUB_API_KEY` secret is set correctly
- Ensure the header is `x-github-key` (not `x-api-key` or other)

### 400 Bad Request
- Check that `tokenList.json` is valid JSON
- Verify all required fields are present
- Ensure contract addresses match the pattern `C[A-Z0-9]{55}`

### 500 Internal Server Error
- Check indexer logs for database connection issues
- Verify the indexer service is running and healthy
