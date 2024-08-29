# Soroswap Token List

Welcome to the official repository for the Soroswap token list. This list is essential for validating swap paths on the Soroswap Automated Market Maker (AMM) protocol on Soroban. By adhering to this list, we ensure a trusted and secure environment for all swaps conducted through Soroswap.

## Adding Your Token to the List

To include your token in the Soroswap token list, ensure your token adheres to the following structure. Fields marked with an asterisk (*) are optional and can be omitted if not applicable to your token.

### Token Information Structure

```plaintext
{
  "code": "string;                 // The code representing your token.
  "issuer": "string?",             // The issuer's account address (optional).
  "contract": "string;             // The contract address for your token.
  "name": "string?",               // The name of your token (optional).
  "org": "string?",                // The organization behind the token (optional).
  "domain": "string?",             // The website for your token or organization (optional).
  "icon": "string;                 // A URL to the token's icon.
  "decimals": number;              // The number of decimals for your token. (7)
}
```

Ensure your token's details are correctly formatted according to the structure above when creating your JSON file. This structured approach helps streamline the inclusion process and maintain the integrity of the Soroswap ecosystem.

### Step-by-Step Guide

1. **Fork this Repository**: Click on the "Fork" button to create a copy of this repository under your GitHub account.

2. **Clone Your Fork**: Clone the forked repository to your local machine.

   ```bash
   git clone https://github.com/<your-username>/token-list.git
   cd token-list
   ```

3. **Add Your Token**: Create a new JSON file within the `tokens` directory. Name it `<CONTRACT_ADDRESS>.json`, replacing `<CONTRACT_ADDRESS>` with your token's actual contract address.

4. **Fill Out Token Information**: Populate the new file with your token's details. Follow the provided structure, including all required fields and any applicable optional fields.

5. **Submit a Pull Request (PR)**: Push the changes to your fork and submit a PR to this repository. The PR should only add the new token file to the `tokens` directory.

### Important Guidelines

- PRs modifying any files other than adding a new token file to the `tokens` directory will be **automatically closed**. This ensures the integrity and security of the token list.
- Upon merging your PR, a GitHub Actions workflow automatically updates the `tokenList.json`. Manual updates to this file are not required in your PR.
- All submissions undergo review. Please allow some time for the review and inclusion process.

## Restoring footprints of the token list
It runs daily. But you can trigger it manually:

Go to github actions and launch the workflow `Restore footprints of the token list`.

## Questions or Concerns?

For questions or further clarification, feel free to open an issue in this repository. We're here to help ensure a smooth integration process for your token into the Soroswap ecosystem.

Thank you for contributing to Soroswap!