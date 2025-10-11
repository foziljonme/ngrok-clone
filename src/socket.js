import { WebSocketServer } from "ws";
import { verifyToken } from "./utils/index.js";
import tunnels from "./services/tunnels.service.js";
import pendingResponses from "./services/pendingresponses.service.js";

export default function handleSocket(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);

    const token = url.searchParams.get("token");

    if (!token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    try {
      const decoded = verifyToken(token);
      const { tunnelId } = decoded;

      console.log("✅ Verified tunnel:", tunnelId);

      wss.handleUpgrade(req, socket, head, (ws) => {
        tunnels.set(tunnelId, ws);
        console.log(`Tunnel ${tunnelId} connected`);
        wss.emit("connection", ws, req);
      });
    } catch (err) {
      console.error("❌ Invalid token:", err.message);
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
    }
  });

  // Periodic cleanup of stale connections
  setInterval(() => {
    for (const [id, ws] of tunnels.entries()) {
      if (ws.readyState !== WebSocket.OPEN) {
        console.log(`Cleaning up stale tunnel: ${id}`);
        tunnels.delete(id);
      }
    }
  }, 60000); // Every minute

  wss.on("connection", (ws, req) => {
    console.log("New WebSocket connection established");

    // Extract tunnel ID again from the URL (useful for logging)
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const tunnelId = url.searchParams.get("id");

    console.log(`Tunnel ${tunnelId} connected`);

    ws.on("close", () => {
      // Clean up the tunnel entry
      if (tunnels.get(tunnelId) === ws) {
        tunnels.delete(tunnelId);
        console.log(`Tunnel ${tunnelId} disconnected and removed from map`);
      }
    });

    ws.on("message", (msg) => {
      const data = JSON.parse(msg.toString());
      if (data.type === "response" && data.requestId) {
        const fn = pendingResponses.get(data.requestId);
        if (fn) {
          pendingResponses.delete(data.requestId);
          fn(data);
        }
      }
    });
  });
}
