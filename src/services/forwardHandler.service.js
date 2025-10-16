// ...existing code...
import pendingResponses from "./pendingresponses.service.js";
import tunnels from "./tunnels.service.js";
import path from "path";

class ForwardHandler {
  constructor() {}

  async handle(req, res) {
    console.log("ForwardHandler handling request:", req.method, req.url);

    // Use Express-normalized hostname when possible (no port)
    const rawHost = req.headers.host || "";
    const hostname = (
      req.hostname ||
      rawHost.split(":")[0] ||
      ""
    ).toLowerCase();

    // validate tunnelId: allow only safe characters
    const tunnelId = hostname.split(".")[0] || "";
    if (!/^[a-z0-9-]{1,64}$/.test(tunnelId)) {
      // Not a valid tunnel id; treat as non-tunnel request
      console.log("Invalid or missing tunnelId parsed from host:", hostname);
    }

    console.log(
      "Incoming request for host:",
      rawHost,
      "hostname:",
      hostname,
      "tunnelId:",
      tunnelId
    );
    const client = tunnels.get(tunnelId);

    // Only trust forwarded proto if you have configured trust proxy in Express
    const protocol = req.protocol || req.headers["x-forwarded-proto"] || "http";
    const mainDomainHost = (process.env.DOMAIN || "").toLowerCase(); // set DOMAIN to your canonical host in production

    console.log("Full URL:", `${protocol}://${rawHost}${req.url}`);
    console.log("Main domain (env):", mainDomainHost || "<not set>");

    // Serve main UI if request is for configured main domain
    if (mainDomainHost && hostname === mainDomainHost) {
      console.log("Request to main domain:", mainDomainHost);
      return res
        .status(200)
        .sendFile(path.join(process.cwd(), "public", "index.html"));
    } else if (tunnelId === "docx") {
      // Serve documentation for requests to docx.<domain>
      console.log("Request to documentation domain:", hostname);
      return res
        .status(200)
        .sendFile(path.join(process.cwd(), "public", "docx.html"));
    }

    // If no tunnel client, redirect to canonical main domain if configured, otherwise 404
    if (!client) {
      console.log("No client for tunnelId:", tunnelId);
      if (mainDomainHost) {
        // Redirect only to trusted canonical host from environment, not arbitrary Host header
        const location = `${protocol}://${mainDomainHost}`;
        res.writeHead(301, { Location: location });
        return res.end();
      }
      return res.status(404).send("Tunnel not found");
    }

    // Protect against huge request bodies
    const MAX_BODY_BYTES = parseInt(
      process.env.MAX_BODY_BYTES || "2_000_000",
      10
    ); // 2MB default
    let received = 0;
    const chunks = [];

    req.on("data", (c) => {
      received += c.length;
      if (received > MAX_BODY_BYTES) {
        console.warn("Request body too large, aborting:", req.url);
        // Destroy the connection to stop receiving more data
        req.destroy();
        try {
          res.status(413).send("Payload too large");
        } catch (e) {}
        return;
      }
      chunks.push(c);
    });

    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("base64");
      const requestId =
        Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const payload = {
        type: "request",
        requestId,
        method: req.method,
        path: req.url,
        headers: req.headers, // consider filtering sensitive headers here
        body,
      };

      try {
        client.send(JSON.stringify(payload), { binary: false }, (err) => {
          if (err) console.warn("Error sending to tunnel client:", err);
        });
      } catch (err) {
        console.error("Failed to send payload to client:", err);
        return res.status(502).send("Bad gateway");
      }

      // Set pending response with timeout
      const TIMEOUT_MS = parseInt(
        process.env.RESPONSE_TIMEOUT_MS || "15000",
        10
      ); // 15s
      let finished = false;
      const timeout = setTimeout(() => {
        if (finished) return;
        finished = true;
        pendingResponses.delete(requestId);
        try {
          res.status(504).send("Upstream tunnel timeout");
        } catch (e) {}
      }, TIMEOUT_MS);

      pendingResponses.set(requestId, (data) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        pendingResponses.delete(requestId);

        // Whitelist response headers that the tunnel client may set
        const allowed = [
          "content-type",
          "content-length",
          "cache-control",
          "expires",
          "last-modified",
          "etag",
          "location",
          // add other safe headers you explicitly allow
        ];
        const safeHeaders = {};
        if (data.headers && typeof data.headers === "object") {
          for (const k of allowed) {
            if (data.headers[k]) safeHeaders[k] = data.headers[k];
          }
        }

        const bodyBuf = data.body
          ? Buffer.from(data.body, "base64")
          : Buffer.alloc(0);
        try {
          res
            .set(safeHeaders)
            .status(data.status || 200)
            .send(bodyBuf);
        } catch (e) {
          console.error("Error writing response for requestId", requestId, e);
        }
      });
    });

    // handle connection errors
    req.on("error", (err) => {
      console.warn("Request stream error:", err);
    });
  }
}

const forwardHandler = new ForwardHandler();
export default forwardHandler;
// ...existing code...
