
const mongoose = require("mongoose");
const dns = require("node:dns").promises;

const DNS_OVER_HTTPS_URL = "https://cloudflare-dns.com/dns-query";

const queryDnsOverHttps = async (name, type) => {
  const url = new URL(DNS_OVER_HTTPS_URL);
  url.searchParams.set("name", name);
  url.searchParams.set("type", type);

  const response = await fetch(url, {
    headers: { accept: "application/dns-json" },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`DNS-over-HTTPS request failed with status ${response.status}`);
  }

  const result = await response.json();
  if (result.Status !== 0) {
    throw new Error(`DNS-over-HTTPS lookup failed with status ${result.Status}`);
  }

  return result.Answer || [];
};

const getSrvConnectionString = async (uri) => {
  const match = uri.match(/^mongodb\+srv:\/\/([^/?#]+)([^?#]*)(?:\?([^#]*))?$/i);
  if (!match) {
    throw new Error("MONGODB_URI is not a valid MongoDB SRV connection string");
  }

  const authority = match[1];
  const host = authority.slice(authority.lastIndexOf("@") + 1);
  if (!host || host.includes(":")) {
    throw new Error("MongoDB SRV connection strings must contain a hostname without a port");
  }

  const [srvRecords, txtRecords] = await Promise.all([
    queryDnsOverHttps(`_mongodb._tcp.${host}`, "SRV"),
    queryDnsOverHttps(host, "TXT"),
  ]);
  const hosts = srvRecords
    .map(({ data }) => {
      const srv = data.match(/^\d+\s+\d+\s+(\d+)\s+([^\s.]+(?:\.[^\s.]+)*)\.?$/);
      if (!srv || Number(srv[1]) < 1 || Number(srv[1]) > 65535) {
        throw new Error("MongoDB SRV DNS returned an invalid record");
      }
      return `${srv[2]}:${srv[1]}`;
    });

  if (hosts.length === 0) {
    throw new Error("MongoDB SRV DNS returned no hosts");
  }

  const options = new Map([["tls", ["tls", "true"]]]);
  for (const record of txtRecords) {
    const text = record.data.replace(/^"|"$/g, "").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    for (const [key, value] of new URLSearchParams(text)) {
      options.set(key.toLowerCase(), [key, value]);
    }
  }

  for (const [key, value] of new URLSearchParams(match[3] || "")) {
    options.set(key.toLowerCase(), [key, value]);
  }

  const credentials = authority.includes("@")
    ? authority.slice(0, authority.lastIndexOf("@") + 1)
    : "";
  const query = new URLSearchParams(Array.from(options.values()));
  const path = match[2] || "";
  return `mongodb://${credentials}${hosts.join(",")}/${path.replace(/^\//, "")}?${query}`;
};

const connectDB = async () => {
  let uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not configured.");
  }
  if (uri.startsWith("mongodb+srv://")) {
    try {
      const host = new URL(uri).hostname;
      await Promise.all([
        dns.resolveSrv(`_mongodb._tcp.${host}`),
        dns.resolveTxt(host),
      ]);
    } catch (error) {
      console.warn("System DNS cannot resolve MongoDB SRV records; using DNS-over-HTTPS fallback.");
      uri = await getSrvConnectionString(uri);
    }
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log("MongoDB connected.");
};

module.exports = connectDB;
