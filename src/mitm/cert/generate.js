const { generateRootCA, loadRootCA, generateLeafCert } = require("./rootCA");

/**
 * Generate Root CA certificate (one-time setup)
 * This replaces the old static wildcard cert approach
 */
function generateCert() {
  return generateRootCA();
}

/**
 * Get certificate for a specific domain (dynamic generation)
 * Used by SNICallback in server.js
 */
async function getCertForDomain(domain) {
  try {
    const rootCA = await loadRootCA();
    return await generateLeafCert(domain, rootCA);
  } catch (error) {
    console.error(`Failed to generate cert for ${domain}:`, error.message);
    return null;
  }
}

module.exports = { generateCert, getCertForDomain };
