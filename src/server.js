import dotenv from "dotenv";
dotenv.config();
import express from "express";
import http from "http";
import { generateRandomSubdomainString, issueTunnel } from "./utils/index.js";
import handleSocket from "./socket.js";
import forwardHandler from "./services/forwardHandler.service.js";
import path from "path";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;
// app.use(express.static(path.join(process.cwd(), "public")));
app.use(express.static(path.join(process.cwd(), "public"), { index: false }));

// conditional static middleware: only serve public static files for the main/canonical host
const mainDomain = (process.env.DOMAIN || "").toLowerCase();

app.use((req, res, next) => {
  const rawHost = req.headers.host || "";
  const hostname = (req.hostname || rawHost.split(":")[0] || "").toLowerCase();
  const subdomain = hostname.split(".")[0] || "";

  // If this request appears to be for a tunnel subdomain (e.g. abc.<domain>)
  // skip static so forwardHandler can route it to the tunnel client.
  const isTunnelSubdomain =
    subdomain &&
    // treat single-label hosts as non-tunnel (e.g. "localhost")
    hostname.includes(".") &&
    // allow explicit mainDomain to bypass tunnel handling
    hostname !== mainDomain;

  if (isTunnelSubdomain) {
    return next(); // do NOT serve static files for tunnel subdomains
  }

  // Serve static files for main/canonical host and local dev
  express.static(path.join(process.cwd(), "public"))(req, res, next);
});

const server = http.createServer(app);

handleSocket(server);

app.post("/tunnels", (req, res) => {
  const tunnelId = generateRandomSubdomainString();
  const token = issueTunnel(tunnelId);
  console.log("serving tunnel: ", tunnelId);
  res.status(200).json({ tunnelId, token });
});

app.get("/stats", (req, res) => {
  res.json({
    activeTunnels: tunnels.size,
    memory: process.memoryUsage(),
  });
});

app.all("*", async (req, res) => {
  console.log("Received request:", req.method, req.url);
  await forwardHandler.handle(req, res);
});

server.listen(PORT, () => {
  const addr = server.address();
  let host = addr.address;
  if (host === "::" || host === "0.0.0.0") host = "localhost";
  console.log(`Tunnel server listening on http://${host}:${addr.port}`);
});
