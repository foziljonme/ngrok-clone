import pendingResponses from "./pendingresponses.service.js";
import tunnels from "./tunnels.service.js";

class ForwardHandler {
  constructor() {}

  async handle(req, res) {
    const host = req.headers.host || "";
    // Expect subdomain like myapp.localhost:8080
    const tunnelId = host.split(".")[0]; // "myapp"
    const client = tunnels.get(tunnelId);

    if (req.headers.host.startsWith("localhost")) {
      return res
        .status(200)
        .send("Listening on tunnels on other subdomains")
        .end();
    } else if (!client) {
      // Perform a 301 Moved Permanently redirect
      res.writeHead(301, {
        Location: "http://localhost:8080", // Redirect to a path within the same site
        // Or to an external URL: 'Location': 'https://www.example.com/new-page'
      });
      return res.end(); // End the response after sending the redirect header
      // return res.status(404).send("No tunnel found for host " + tunnelId);
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
