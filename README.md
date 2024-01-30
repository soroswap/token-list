# Token List of Soroswap

This token list is used to validate the paths of the swaps.

## How to add a token to the list

To add a token to the list, follow these steps:

1. Fork the repository.
2. Clone the forked repository to your local machine.
3. Navigate to the `token-list` directory.
4. Open the `tokenList.json` file.
5. Add the token details to the JSON array in the following format:
```
    {
    "chainId": "testnet",
    "address": "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    "name": "centre.ioUSDCoin",
    "symbol": "USDC",
    "decimals": 7,
    "logoURI": ""
    }
```