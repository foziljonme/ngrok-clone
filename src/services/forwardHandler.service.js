import dotenv from "dotenv";
dotenv.config();
import { sanitizeBaseUrl } from "../utils/index.js";
import pendingResponses from "./pendingresponses.service.js";
import tunnels from "./tunnels.service.js";
const BASE_URL = process.env.BASE_URL;

class ForwardHandler {
  constructor() {}

  async handle(req, res) {
    const host = req.headers.host || "";
    // Expect subdomain like myapp.localhost:8080
    const tunnelId = host.split(".")[0]; // "myapp"
    const client = tunnels.get(tunnelId);
    const currentHost = sanitizeBaseUrl(req.headers.host);
    console.log(`Incoming request for host: ${currentHost}`);
    console.log(`Tunnel ID: ${tunnelId}`);
    if (currentHost.startsWith(sanitizeBaseUrl(BASE_URL))) {
      console.log("Request to base URL, not forwarding");
      return res
        .status(200)
        .send("Listening on tunnels on other subdomains")
        .end();
    } else if (!client) {
      console.log(
        `No tunnel client for id ${tunnelId}, rediricting to BASE_URL: ${BASE_URL}`
      );
      // Perform a 301 Moved Permanently redirect
      res.writeHead(301, {
        Location: BASE_URL, // Redirect to a path within the same site
      });
      return res.end(); // End the response after sending the redirect header
    }

    const requestId =
      Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const chunks = [];
    req.on("data", (c) => {
      chunks.push(c);
    });
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("base64");
      const payload = {
        type: "request",
        requestId,
        method: req.method,
        path: req.url,
        headers: req.headers,
        body,
      };

      client.send(JSON.stringify(payload));

      pendingResponses.set(requestId, (data) => {
        const bodyBuf = data.body
          ? Buffer.from(data.body, "base64")
          : Buffer.alloc(0);
        res
          .set(data.headers || {})
          .status(data.status || 200)
          .send(bodyBuf);
      });
    });
  }
}

const forwardHandler = new ForwardHandler();
export default forwardHandler;
