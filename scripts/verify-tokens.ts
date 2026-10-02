import { readFileSync, existsSync } from "fs";
import { join } from "path";

const TOKENS_PATH = join(__dirname, "../tokens.json");

function main() {
  if (!existsSync(TOKENS_PATH)) {
    console.error(`Tokens file not found: ${TOKENS_PATH}`);
    process.exit(1);
  }

  let data: string;
  try {
    data = readFileSync(TOKENS_PATH, "utf8");
  } catch (err) {
    console.error(`Error reading tokens file: ${err}`);
    process.exit(1);
  }

  let tokens: { [symbol: string]: string } = {};
  try {
    tokens = JSON.parse(data);
  } catch (err) {
    console.error(`Error parsing tokens JSON: ${err}`);
    process.exit(1);
  }

  const symbols = Object.keys(tokens);
  console.log(`Found ${symbols.length} tokens in the list:`);

  for (const symbol of symbols) {
    console.log(`\t${symbol} -> ${tokens[symbol]}`);
  }
}

main();
