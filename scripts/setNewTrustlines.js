const tokensList = require('../tokenList.json');
//const newTokensList = require('../newTokensList.json');

for (const token of newTokensList) {
  if (!tokensList.includes(token)) {
    console.log(token);
  }
}

console.log(tokenList)