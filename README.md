# Soroswap Token List

Token list for the Soroswap DEX on Stellar.

## Usage

This repository contains the official token list used by Soroswap. Tokens can be added by submitting a PR.

### Adding a Token

1. Add your token metadata to `tokenList.json`
2. Submit a Pull Request

### Running Scripts

```bash
# Set trustlines for all tokens (skips non-SAC tokens)
npm run setTrustlines
```

## Non-SAC Tokens

Soroban-native (WASM) tokens do not have a classic `code`/`issuer` structure. They use `contract` instead. The indexer sync and trustline scripts handle these gracefully by skipping assets without `code`/`issuer`.
