<!--
Thanks for contributing to the Soroswap token list!
Fill in the section that matches your PR and delete the other one.
-->

## Token submission

**Token:** `CODE` by ORGANIZATION
**Contract:** `C...`
**Issuer:** `G...` (leave blank for a custom Soroban token)

### Checklist

- [ ] This PR adds or edits exactly one file, `assets/<CONTRACT_ADDRESS>.json`, named after the token's Soroban contract address.
- [ ] It does not touch `tokenList.json` (CI regenerates it after merge) or any other file.
- [ ] `name` and `org` are filled in, and `code`, `issuer`, `contract`, `domain`, `icon` and `decimals` match the asset's `stellar.toml`.
- [ ] `domain` is the bare domain (no `https://`) and is the same as the issuer account's on-chain `home_domain`.
- [ ] `icon` is a public URL that returns an image, or an IPFS CID.
- [ ] `yarn && yarn verify` passes locally.
- [ ] I represent the organization issuing this token, or I have linked below where they asked for this listing.

### Asset type

- [ ] Stellar classic asset: `contract` is the Stellar Asset Contract derived from `code` and `issuer`.
- [ ] Custom Soroban token (no `issuer`): link the contract source code and any audit below.

### Notes for reviewers

<!-- Issuer lock status, auth flags, liquidity, links to the project. Anything that helps review. -->

---

## Maintainer change

<!-- Scripts, workflows or docs. What changed and why. `yarn test` and `yarn verify` must pass. -->
