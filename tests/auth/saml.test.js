import { it as test, beforeAll, afterEach, vi } from "vitest";
import selfsigned from "selfsigned";
import { SignedXml } from "xml-crypto";
import assert from "node:assert/strict";
import {
  formatX509Certificate,
  isSamlConfigured,
  generateSamlMetadata,
  pickSamlEmail,
  pickSamlDisplayName,
  buildSamlAuthorizeUrl,
  validateSamlResponse,
} from "../../src/lib/auth/saml.js";
import { GET as startSaml } from "../../src/app/api/auth/saml/start/route.js";
import { POST as samlAcs } from "../../src/app/api/auth/saml/acs/route.js";
import { getDashboardAuthSession } from "../../src/lib/auth/dashboardSession.js";

const routeState = vi.hoisted(() => ({ settings: {}, cookies: new Map() }));
vi.mock("../../src/lib/localDb.js", () => ({ getSettings: async () => routeState.settings }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name) => routeState.cookies.get(name),
    set: (name, value, options) => routeState.cookies.set(name, { value, ...options }),
    delete: (name) => routeState.cookies.delete(name),
  }),
}));

let pems;
let settings;
const origin = "https://sp.example.com";
const startRequest = () => new Request(`${origin}/api/auth/saml/start`);

beforeAll(async () => {
  pems = await selfsigned.generate([{ name: "commonName", value: "idp.example.com" }], {
    keySize: 2048,
    algorithm: "sha256",
  });
  settings = {
    baseUrl: origin,
    samlEntryPoint: "https://idp.example.com/sso",
    samlIssuer: "urn:kitsunerouter:sp",
    samlCert: pems.cert,
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  routeState.cookies.clear();
});

function signElement(xml, element) {
  const signature = new SignedXml({
    privateKey: pems.private,
    publicCert: pems.cert,
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#",
  });
  signature.addReference({
    xpath: `/*[local-name()='${element}']`,
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/2001/10/xml-exc-c14n#",
    ],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
  });
  signature.computeSignature(xml);
  return signature.getSignedXml();
}

function signedResponse(requestId, { responseId = requestId, subjectId = requestId, confirmations } = {}) {
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const correlation = (id) => id === null ? "" : ` InResponseTo="${id}"`;
  const confirmationXml = (confirmations || [{ id: subjectId }]).map((confirmation) => `
    <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:${confirmation.method || "bearer"}">
      <saml:SubjectConfirmationData${correlation(confirmation.id === undefined ? requestId : confirmation.id)}
        NotOnOrAfter="${confirmation.expires || expires}" Recipient="${origin}/api/auth/saml/acs">${confirmation.method === "holder-of-key" ? `<ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:X509Data><ds:X509Certificate>${pems.cert.replace(/-----[^-]+-----|\s/g, "")}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>` : ""}</saml:SubjectConfirmationData>
    </saml:SubjectConfirmation>`).join("");
  const assertion = signElement(
    `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_assertion" Version="2.0" IssueInstant="${now}">
      <saml:Issuer>https://idp.example.com</saml:Issuer>
      <saml:Subject><saml:NameID>alice@example.com</saml:NameID>
        ${confirmationXml}
      </saml:Subject>
      <saml:Conditions NotOnOrAfter="${expires}"><saml:AudienceRestriction><saml:Audience>${settings.samlIssuer}</saml:Audience></saml:AudienceRestriction></saml:Conditions>
      <saml:AuthnStatement AuthnInstant="${now}"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>
    </saml:Assertion>`,
    "Assertion"
  );
  const response = signElement(
    `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="_response" Version="2.0" IssueInstant="${now}"${correlation(responseId)} Destination="${origin}/api/auth/saml/acs">
      <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>${assertion}
    </samlp:Response>`,
    "Response"
  );
  return { SAMLResponse: Buffer.from(response).toString("base64") };
}

function callbackRequest(body, ip = "192.0.2.1") {
  return new Request(`${origin}/api/auth/saml/acs`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-real-ip": ip },
    body: new URLSearchParams(body),
  });
}

test("SP-initiated signed SAML response accepts exactly one concurrent callback", async () => {
  const { requestId } = await buildSamlAuthorizeUrl(startRequest(), settings);
  const body = signedResponse(requestId);
  const results = await Promise.allSettled([
    validateSamlResponse(startRequest(), body, requestId, settings),
    validateSamlResponse(startRequest(), body, requestId, settings),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.find((result) => result.status === "fulfilled").value.nameID, "alice@example.com");
  await assert.rejects(validateSamlResponse(startRequest(), body, requestId, settings));
});

test("valid correlated bearer accepts once despite an alternative holder-of-key confirmation", async () => {
  const { requestId } = await buildSamlAuthorizeUrl(startRequest(), settings);
  const body = signedResponse(requestId, { confirmations: [
    { id: requestId },
    { method: "holder-of-key", id: null },
  ] });
  const profile = await validateSamlResponse(startRequest(), body, requestId, settings);
  assert.equal(profile.nameID, "alice@example.com");
  await assert.rejects(validateSamlResponse(startRequest(), body, requestId, settings));
});

test("expired correlated bearer cannot rescue a selected uncorrelated confirmation", async () => {
  const { requestId } = await buildSamlAuthorizeUrl(startRequest(), settings);
  const body = signedResponse(requestId, { confirmations: [
    { id: requestId, expires: new Date(Date.now() - 120000).toISOString() },
    { id: null },
    { method: "holder-of-key", id: requestId },
  ] });
  await assert.rejects(validateSamlResponse(startRequest(), body, requestId, settings));
});

test("selected mismatched valid bearer rejects even with a later matching bearer", async () => {
  const { requestId } = await buildSamlAuthorizeUrl(startRequest(), settings);
  const body = signedResponse(requestId, { confirmations: [
    { id: "_different" },
    { id: requestId },
  ] });
  await assert.rejects(validateSamlResponse(startRequest(), body, requestId, settings));
});

test("signed captured assertion cannot authenticate without browser state", async () => {
  const { requestId } = await buildSamlAuthorizeUrl(startRequest(), settings);
  await assert.rejects(validateSamlResponse(startRequest(), signedResponse(requestId), "", settings));
});

test("callback rejects both absent and mismatched protocol and signed subject correlation", async () => {
  for (const overrides of [
    { responseId: null },
    { responseId: "_other" },
    { subjectId: null },
    { subjectId: "_other" },
  ]) {
    const { requestId } = await buildSamlAuthorizeUrl(startRequest(), settings);
    await assert.rejects(validateSamlResponse(startRequest(), signedResponse(requestId, overrides), requestId, settings));
    await assert.rejects(validateSamlResponse(startRequest(), signedResponse(requestId), requestId, settings));
  }
});

test("callback state cannot be swapped between two initiated requests or SAML configurations", async () => {
  const first = await buildSamlAuthorizeUrl(startRequest(), settings);
  const second = await buildSamlAuthorizeUrl(startRequest(), settings);
  await assert.rejects(validateSamlResponse(startRequest(), signedResponse(first.requestId), second.requestId, settings));
  assert.equal((await validateSamlResponse(startRequest(), signedResponse(first.requestId), first.requestId, settings)).nameID, "alice@example.com");
  const third = await buildSamlAuthorizeUrl(startRequest(), settings);
  await assert.rejects(validateSamlResponse(startRequest(), signedResponse(third.requestId), third.requestId, {
    ...settings, samlEntryPoint: "https://different-idp.example.com/sso",
  }));
});

test("expired initiated request rejects a still-valid signed assertion", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const { requestId } = await buildSamlAuthorizeUrl(startRequest(), settings);
  const body = signedResponse(requestId);
  vi.setSystemTime(Date.now() + 10 * 60 * 1000);
  await assert.rejects(validateSamlResponse(startRequest(), body, requestId, settings));
});

test("SAML start issues cross-site POST state; ACS authenticates once and clears state", async () => {
  vi.stubEnv("JWT_SECRET", "saml-test-secret-with-at-least-32-characters");
  routeState.settings = settings;
  await startSaml(startRequest());
  const state = routeState.cookies.get("saml_state");
  assert.equal(state.sameSite, "none");
  assert.equal(state.secure, true);
  assert.equal(state.httpOnly, true);
  const body = signedResponse(state.value);
  const result = await samlAcs(callbackRequest(body));
  assert.equal(new URL(result.headers.get("location")).pathname, "/dashboard");
  assert.equal(routeState.cookies.has("saml_state"), false);
  const session = await getDashboardAuthSession(routeState.cookies.get("auth_token").value);
  assert.equal(session.samlEmail, "alice@example.com");
  routeState.cookies.delete("auth_token");
  routeState.cookies.set("saml_state", state);
  const replay = await samlAcs(callbackRequest(body, "192.0.2.2"));
  assert.equal(new URL(replay.headers.get("location")).pathname, "/login");
  assert.equal(routeState.cookies.has("auth_token"), false);
});

test("ACS without state never mints an authentication cookie", async () => {
  vi.stubEnv("JWT_SECRET", "saml-test-secret-with-at-least-32-characters");
  routeState.settings = settings;
  const { requestId } = await buildSamlAuthorizeUrl(startRequest(), settings);
  const result = await samlAcs(callbackRequest(signedResponse(requestId), "192.0.2.3"));
  assert.equal(new URL(result.headers.get("location")).pathname, "/login");
  assert.equal(routeState.cookies.has("auth_token"), false);
});

test("failed ACS parsing consumes state and cannot authenticate on retry", async () => {
  vi.stubEnv("JWT_SECRET", "saml-test-secret-with-at-least-32-characters");
  routeState.settings = settings;
  const { requestId } = await buildSamlAuthorizeUrl(startRequest(), settings);
  routeState.cookies.set("saml_state", { value: requestId });
  const failed = await samlAcs(callbackRequest({}, "192.0.2.4"));
  assert.equal(new URL(failed.headers.get("location")).pathname, "/login");
  assert.equal(routeState.cookies.has("saml_state"), false);
  assert.equal(routeState.cookies.has("auth_token"), false);
  await assert.rejects(validateSamlResponse(startRequest(), signedResponse(requestId), requestId, settings));
});

test("invalid signature consumes initiated state before a later valid assertion", async () => {
  const { requestId } = await buildSamlAuthorizeUrl(startRequest(), settings);
  const valid = signedResponse(requestId);
  const tampered = Buffer.from(valid.SAMLResponse, "base64").toString().replace("alice@example.com", "attacker@example.com");
  await assert.rejects(validateSamlResponse(startRequest(), {
    SAMLResponse: Buffer.from(tampered).toString("base64"),
  }, requestId, settings), /signature/i);
  await assert.rejects(validateSamlResponse(startRequest(), valid, requestId, settings));
});

test("ACS rejects missing, mismatched, and expired correlation without setting auth cookies", async () => {
  vi.stubEnv("JWT_SECRET", "saml-test-secret-with-at-least-32-characters");
  routeState.settings = settings;
  vi.useFakeTimers({ toFake: ["Date"] });
  for (const [index, overrides] of [{ responseId: null }, { subjectId: "_other" }, {}].entries()) {
    const { requestId } = await buildSamlAuthorizeUrl(startRequest(), settings);
    const body = signedResponse(requestId, overrides);
    if (index === 2) vi.setSystemTime(Date.now() + 10 * 60 * 1000);
    routeState.cookies.set("saml_state", { value: requestId });
    const result = await samlAcs(callbackRequest(body, `192.0.2.${index + 10}`));
    assert.equal(new URL(result.headers.get("location")).pathname, "/login");
    assert.equal(routeState.cookies.has("saml_state"), false);
    assert.equal(routeState.cookies.has("auth_token"), false);
  }
});

test("formatX509Certificate normalizes Base64 strings into PEM blocks", () => {
  const rawBase64 = "MIIC1234567890123456789012345678901234567890123456789012345678901234567890";
  const formatted = formatX509Certificate(rawBase64);
  assert.match(formatted, /-----BEGIN CERTIFICATE-----/);
  assert.match(formatted, /-----END CERTIFICATE-----/);
  assert.equal(formatX509Certificate(""), "");
});

test("isSamlConfigured checks required fields", () => {
  assert.equal(isSamlConfigured({ samlEntryPoint: "https://idp.com/sso", samlCert: "cert" }), true);
  assert.equal(isSamlConfigured({ samlEntryPoint: "https://idp.com/sso" }), false);
  assert.equal(isSamlConfigured({}), false);
});

test("generateSamlMetadata produces valid SP XML", () => {
  const settings = {
    samlEntryPoint: "https://idp.example.com/sso",
    samlIssuer: "urn:kitsunerouter:sp",
    samlCert: "MIIC123456789012345678901234567890123456789012345678901234567890",
  };
  const xml = generateSamlMetadata("https://localhost:20127", settings);
  assert.match(xml, /entityID="urn:kitsunerouter:sp"/);
  assert.match(xml, /Location="https:\/\/localhost:20127\/api\/auth\/saml\/acs"/);
});

test("Claims Extraction pickSamlEmail & pickSamlDisplayName", () => {
  const profile = { email: "test@example.com", name: "Test User" };
  assert.equal(pickSamlEmail(profile, {}), "test@example.com");
  assert.equal(pickSamlDisplayName(profile, {}), "Test User");
});
