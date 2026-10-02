export function getTokenListSchema(): object {
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "https://raw.githubusercontent.com/soroswap/token-list/master/tokens/token.schema.json",
    description: "Schema for Soroswap token list",
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name of the token",
      },
      symbol: {
        type: "string",
        description: "Symbol of the token",
      },
      decimals: {
        type: "number",
        description: "Decimals of the token",
        minimum: 0,
        maximum: 18,
      },
      address: {
        type: "string",
        description: "Contract address of the token",
        pattern: "^0x[a-fA-F0-9]{40}$",
      },
      network: {
        type: "string",
        description: "Network of the token",
        enum: ["ethereum", "bsc", "polygon", "avalanche", "arbitrum", "optimism"],
      },
    },
    required: ["name", "symbol", "decimals", "address", "network"],
  }
}
