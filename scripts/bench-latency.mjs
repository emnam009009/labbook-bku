const TOKEN = "eyJhbGciOiJSUzI1NiIsImtpZCI6Ijg2OGU0YWNlMGI2NTE2ZDM2YjlmNTZkZThjZTQ5Nzg4ZmNjZGFjNDMiLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoiTmd1eeG7hW4gVsSDbiBIw6AgTmFtIiwidGVuYW50SWQiOiJkZWZhdWx0Iiwicm9sZSI6InN1cGVyYWRtaW4iLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vbGFiLW1hbmFnZXItMjY4YTYiLCJhdWQiOiJsYWItbWFuYWdlci0yNjhhNiIsImF1dGhfdGltZSI6MTc3ODQ5MzM5MywidXNlcl9pZCI6ImtSOHBPSWlvYndhcHZlVzhFeUk4d1RJOWE1TjIiLCJzdWIiOiJrUjhwT0lpb2J3YXB2ZVc4RXlJOHdUSTlhNU4yIiwiaWF0IjoxNzc4NDkzMzkzLCJleHAiOjE3Nzg0OTY5OTMsImVtYWlsIjoibnZobi43MjAyQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJmaXJlYmFzZSI6eyJpZGVudGl0aWVzIjp7ImVtYWlsIjpbIm52aG4uNzIwMkBnbWFpbC5jb20iXX0sInNpZ25faW5fcHJvdmlkZXIiOiJwYXNzd29yZCJ9fQ.Fyv_j5vTdjqjjZJ7CGtmDrJntG0W7dy21MoPy0NMiqkVAd8OxoyufqD1FUDXB9wlCoh_mz2koJ4zrNZHamrozTmrZExo0EkY7hstCkHFY42SO1f2S6m6UX9XIXYAD-YdcAEUlHubGOxuoXSBnoov2ICmWyMd8fIi36rLiY2_KCF0mNsfktDuEQBXcCj0l1QQvTvEk98VnQyjuRWD4LFNQtJP8H0BN4GupMz02fOUpxLG4X34GsPcnGLjah0NjQJEBHXwhDknFqVV1DGTWaakOhc0hN3EPZeaQ0jAf1GICWEea6lfAXSU821iTES_H7rF3njMHbI7BNS5ovLe4lcAxQ";
const BASE = "https://asia-southeast1-lab-manager-268a6.cloudfunctions.net";

async function measure(name, url, body, runs = 15) {
  const latencies = [];
  process.stdout.write(`Measuring ${name}...`);
  for (let i = 0; i < runs; i++) {
    const t0 = Date.now();
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(body),
    });
    latencies.push(Date.now() - t0);
    process.stdout.write(".");
    await new Promise(r => setTimeout(r, 400));
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const n = sorted.length;
  console.log(`\n${name}:`);
  console.table({
    p50: sorted[Math.floor(n * 0.5)] + "ms",
    p95: sorted[Math.floor(n * 0.95)] + "ms",
    p99: sorted[Math.floor(n * 0.99)] + "ms",
    mean: Math.round(sorted.reduce((s,v)=>s+v,0)/n) + "ms",
  });
}

await measure("searchChemicals", `${BASE}/toolExecutor`, {
  name: "searchChemicals", args: { query: "WO3" }
});

await measure("searchPapers (RAG)", `${BASE}/searchPapers`, {
  query: "WO3 bandgap", limit: 5
});
