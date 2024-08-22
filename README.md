# Soroswap Token List

Welcome to the official repository for the Soroswap token list. This list is essential for validating swap paths on the Soroswap Automated Market Maker (AMM) protocol on Soroban. By adhering to this list, we ensure a trusted and secure environment for all swaps conducted through Soroswap.

## Adding Your Token to the List

To include your token in the Soroswap token list, ensure your token adheres to the following structure. Fields marked with an asterisk (*) are optional and can be omitted if not applicable to your token.

### Token Information Structure

```plaintext
{
  "code": "string;                 // ACT.
  "issuer": "string?",             // GAHHULDPDVGB5WS5PH7BCGLJ7ZHECDBIIMKB62UPVDUOCHNFL7HX3FS7.
  "contract": "string;             // CAU7TR4L52CSCYOLOPXPJJ7T6EMEXTEE4XKRH2ASY23EFYEMU5WUFYP2.
  "name": "string?",               // Authentic-Payment Community Token.
  "org": "string?",                // Authentic-Payment.
  "domain": "string?",             // Authentic-payment.com.
  "icon": "string;                 // https://authentic-payment.com/wp-content/uploads/2023/01/IMG_1156.png.
  "decimals": number;              // 5.
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

## Questions or Concerns?

For questions or further clarification, feel free to open an issue in this repository. We're here to help ensure a smooth integration process for your token into the Soroswap ecosystem.

Thank you for contributing to Soroswap!
