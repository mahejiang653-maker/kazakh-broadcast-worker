import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const API = "https://api.cloudflare.com/client/v4";
const PRODUCTION = "kazakh-broadcast-worker";
const PROBE = "kazakh-broadcast-m3-remix-probe-20261105";

export async function selectProbeAccount({ token, accountId, probeMustExist = false, fetcher = fetch }) {
  if (!token) throw new Error("Cloudflare deployment token is missing");
  const read = async url => {
    const response = await fetcher(url, { method: "GET", headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Cloudflare read-only API returned HTTP ${response.status}`);
    const data = await response.json();
    if (data.success !== true || !Array.isArray(data.result)) throw new Error("Cloudflare returned an invalid account or Worker list");
    return data;
  };
  let accounts;
  if (accountId) accounts = [{ id: accountId }];
  else {
    const data = await read(`${API}/accounts?per_page=100`);
    if ((data.result_info?.total_pages ?? 1) > 1) throw new Error("Cloudflare account list is incomplete");
    accounts = data.result;
  }
  const matches = [];
  for (const account of accounts) {
    if (typeof account.id !== "string" || !/^[A-Za-z0-9]+$/.test(account.id)) throw new Error("Cloudflare account ID is invalid");
    const scripts = await read(`${API}/accounts/${account.id}/workers/scripts`);
    const names = scripts.result.map(script => script.id);
    if (names.includes(PRODUCTION)) matches.push({ id: account.id, names });
  }
  if (matches.length !== 1) throw new Error("Expected exactly one Cloudflare account containing the production Worker");
  const probeExists = matches[0].names.includes(PROBE);
  if (!probeMustExist && probeExists) throw new Error("The isolated probe Worker already exists; refusing to overwrite it");
  if (probeMustExist && !probeExists) throw new Error("The isolated probe Worker does not exist");
  return matches[0].id;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const probeMustExist = process.env.M3_PROBE_MUST_EXIST === "true";
    const accountId = await selectProbeAccount({ token: process.env.CLOUDFLARE_API_TOKEN, accountId: process.env.CLOUDFLARE_ACCOUNT_ID, probeMustExist });
    if (!/^[0-9a-f]{32}$/i.test(accountId) || !process.env.GITHUB_ENV) throw new Error("Invalid account ID or GitHub Actions environment");
    console.log(`::add-mask::${accountId}`);
    await appendFile(process.env.GITHUB_ENV, `CLOUDFLARE_ACCOUNT_ID=${accountId}\n`);
    console.log(probeMustExist ? "Verified the existing site and isolated probe Worker share one account." : "Verified one account containing the existing site; isolated Worker name is unused.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safe = /^(?:Cloudflare deployment token is missing|Cloudflare read-only API returned HTTP \d{3}|Cloudflare returned an invalid account or Worker list|Cloudflare account list is incomplete|Cloudflare account ID is invalid|Expected exactly one Cloudflare account containing the production Worker|The isolated probe Worker already exists; refusing to overwrite it|The isolated probe Worker does not exist|Invalid account ID or GitHub Actions environment)$/;
    console.error(safe.test(message) ? message : "Cloudflare account check failed without changing any Worker");
    process.exitCode = 1;
  }
}
