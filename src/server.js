import express from "express";
import http from "http";
import {
  generateRandomSubdomainString,
  issueTunnel,
  verifyToken,
} from "./utils/index.js";
import handleSocket from "./socket.js";
import dotenv from "dotenv";
import forwardHandler from "./services/forwardHandler.service.js";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

const server = http.createServer(app);

handleSocket(server);

app.post("/tunnels", (req, res) => {
  const tunnelId = generateRandomSubdomainString();
  const token = issueTunnel(tunnelId);
  console.log("serving tunnel: ", tunnelId);
  res.status(200).json({ tunnelId, token });
});

app.all("*", forwardHandler.handle);

server.listen(PORT, () => {
  console.log(`Tunnel server listening on http://localhost:${PORT}`);
});
