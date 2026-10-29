"use client";

import { DEFAULT_LOCALE, LOCALE_COOKIE, normalizeLocale } from "./config";

const TRANSLATABLE_ATTRIBUTES = ["placeholder", "title", "aria-label", "aria-description", "alt"];
const SKIP_SELECTOR = "[data-i18n-skip],script,style,code,pre,kbd,samp,textarea,[contenteditable=true],.font-mono,.material-symbols-outlined";
const dictionaryRequests = new Map();
const subscribers = new Set();
const textSources = new WeakMap();
const attributeSources = new WeakMap();
const pendingNodes = new Set();
let translationMap = Object.create(null);
let messageTemplates = [];
let currentLocale = DEFAULT_LOCALE;
let requestVersion = 0;
let observer;
let animationFrame;
let consumers = 0;

function getLocaleFromCookie() {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const entry = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${LOCALE_COOKIE}=`));
  try {
    return normalizeLocale(entry ? decodeURIComponent(entry.slice(LOCALE_COOKIE.length + 1)) : DEFAULT_LOCALE);
  } catch {
    return DEFAULT_LOCALE;
  }
}

async function loadTranslations(locale) {
  if (locale === DEFAULT_LOCALE) return Object.create(null);
  if (!dictionaryRequests.has(locale)) {
    const request = fetch(`/i18n/literals/${locale}.json`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Translation dictionary unavailable (${response.status})`);
        const dictionary = await response.json();
        if (!dictionary || typeof dictionary !== "object" || Array.isArray(dictionary)
          || Object.values(dictionary).some((value) => typeof value !== "string")) {
          throw new Error("Invalid translation dictionary");
        }
        return Object.assign(Object.create(null), dictionary);
      })
      .catch((error) => { dictionaryRequests.delete(locale); throw error; });
    dictionaryRequests.set(locale, request);
  }
  return dictionaryRequests.get(locale);
}

const interpolate = (message, parameters) => message.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g,
  (placeholder, name) => parameters && Object.hasOwn(parameters, name) ? String(parameters[name]) : placeholder);
const escapePattern = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function compileMessageTemplates(dictionary) {
  return Object.entries(dictionary).filter(([key]) => /\{[A-Za-z][A-Za-z0-9_]*\}/.test(key)
      && key.replace(/\{[A-Za-z][A-Za-z0-9_]*\}/g, "").trim().length >= 3)
    .map(([key, value]) => {
      const names = [];
      const pattern = key.split(/(\{[A-Za-z][A-Za-z0-9_]*\})/).map((part) => {
        if (/^\{[A-Za-z][A-Za-z0-9_]*\}$/.test(part)) {
          const name = part.slice(1, -1);
          names.push(name);
          return name === "count" || name === "index" ? "([0-9]+(?:[.,][0-9]+)*)" : "(.*?)";
        }
        return escapePattern(part);
      }).join("");
      return { pattern: new RegExp(`^${pattern}$`), names, value };
    });
}

/** Translate a source literal or a named template without changing identifiers. */
export function translate(text, parameters) {
  if (typeof text !== "string" || !text.trim()) return text;
  const source = text.trim();
  let translated = source;
  if (currentLocale !== DEFAULT_LOCALE) {
    if (Object.hasOwn(translationMap, source)) translated = translationMap[source];
    else if (Object.hasOwn(translationMap, source.replace(/\s+/g, " "))) translated = translationMap[source.replace(/\s+/g, " ")];
    else if (!parameters) {
      for (const { pattern, names, value } of messageTemplates) {
        const match = source.match(pattern);
        if (match) {
          translated = interpolate(value, Object.fromEntries(names.map((name, index) => [name, match[index + 1]])));
          break;
        }
      }
    }
  }
  translated = interpolate(translated, parameters);
  return text.slice(0, text.length - text.trimStart().length) + translated + text.slice(text.trimEnd().length);
}

export function getCurrentLocale() { return currentLocale; }
export function onLocaleChange(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

function skipped(element) { return !element || Boolean(element.closest(SKIP_SELECTOR)); }
function processTextNode(node) {
  const parent = node.parentElement;
  if (skipped(parent) || !node.nodeValue?.trim()) return;
  // React may replace a text node's value without inserting a new node. Preserve
  // its newest source rather than restoring an obsolete count/status on reload.
  const previous = textSources.get(node);
  const source = previous && node.nodeValue === previous.rendered ? previous.source : node.nodeValue;
  const rendered = translate(source);
  textSources.set(node, { source, rendered });
  if (node.nodeValue !== rendered) node.nodeValue = rendered;
}
function processAttributes(element) {
  if (skipped(element)) return;
  let sources = attributeSources.get(element);
  if (!sources) { sources = new Map(); attributeSources.set(element, sources); }
  for (const name of TRANSLATABLE_ATTRIBUTES) {
    const value = element.getAttribute(name);
    if (value === null) { sources.delete(name); continue; }
    const previous = sources.get(name);
    const source = previous && value === previous.rendered ? previous.source : value;
    const rendered = translate(source);
    sources.set(name, { source, rendered });
    if (value !== rendered) element.setAttribute(name, rendered);
  }
}
function processElement(element) {
  if (!element) return;
  if (element.nodeType === Node.TEXT_NODE) { processTextNode(element); return; }
  if (element.nodeType !== Node.ELEMENT_NODE || skipped(element)) return;
  processAttributes(element);
  for (const child of element.querySelectorAll("*")) processAttributes(child);
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) processTextNode(node);
}
function schedule(node) {
  pendingNodes.add(node);
  if (animationFrame !== undefined) return;
  animationFrame = requestAnimationFrame(() => {
    animationFrame = undefined;
    const work = [...pendingNodes];
    pendingNodes.clear();
    for (const target of work) processElement(target);
  });
}
function ensureObserver() {
  if (observer) return;
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData" || mutation.type === "attributes") schedule(mutation.target);
      else for (const node of mutation.addedNodes) schedule(node);
    }
  });
  observer.observe(document.body, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: TRANSLATABLE_ATTRIBUTES,
  });
}

// One observer per document, even during React strict-mode remounts.
export async function initRuntimeI18n() {
  if (typeof window === "undefined") return () => {};
  consumers++;
  ensureObserver();
  try { await reloadTranslations(); }
  catch { /* Keep the visible source language; selection UI can report retries. */ }
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    consumers--;
    if (!consumers) {
      observer?.disconnect();
      observer = undefined;
      if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
      animationFrame = undefined;
      pendingNodes.clear();
    }
  };
}

export async function reloadTranslations() {
  if (typeof document === "undefined") return false;
  const version = ++requestVersion;
  const locale = getLocaleFromCookie();
  const dictionary = await loadTranslations(locale);
  // A slower earlier locale fetch cannot overwrite a more recent selection.
  if (version !== requestVersion) return false;
  translationMap = dictionary;
  messageTemplates = compileMessageTemplates(dictionary);
  currentLocale = locale;
  document.documentElement.lang = locale;
  processElement(document.body);
  for (const callback of subscribers) callback();
  return true;
}
