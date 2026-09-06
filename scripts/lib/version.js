'use strict';

// Not semver: every field rolls over at 9 like an odometer, and major is capped at 999.
// Downstream consumers only compare versions for equality, so keep the historical scheme.
function incrementVersion(version) {
  let [major, minor, patch] = version.split('.').map((num) => parseInt(num, 10));

  patch += 1;
  if (patch > 9) {
    patch = 0;
    minor += 1;
    if (minor > 9) {
      minor = 0;
      major += 1;
    }
  }

  major = Math.min(major, 999);

  return `${major}.${minor}.${patch}`;
}

module.exports = { incrementVersion };
