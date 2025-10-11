import dotenv from "dotenv";
dotenv.config();
import express from "express";
import http from "http";
import { generateRandomSubdomainString, issueTunnel } from "./utils/index.js";
import handleSocket from "./socket.js";
import forwardHandler from "./services/forwardHandler.service.js";

const app = express();
const PORT = process.env.PORT;

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
