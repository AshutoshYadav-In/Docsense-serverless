const axios = require("axios");

/**
 * @param {string} baseUrl - JAVA_API_BASE_URL (no trailing slash required)
 * @param {string} path - e.g. "/api/internal/embed"
 */
function joinUrl(baseUrl, path) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

/**
 * @param {import('axios').AxiosError} err
 */
function formatAxiosError(err) {
  const status = err.response?.status;
  const body =
    typeof err.response?.data === "string"
      ? err.response.data
      : JSON.stringify(err.response?.data ?? {});
  return new Error(
    `HTTP ${status ?? "?"} ${err.message}${body ? ` — ${body.slice(0, 500)}` : ""}`
  );
}

module.exports = { joinUrl, formatAxiosError };
