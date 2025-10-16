import crypto from "crypto";
import jwt from "jsonwebtoken";

export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

export function issueTunnel(tunnelId) {
  return jwt.sign({ tunnelId }, process.env.JWT_SECRET, { expiresIn: "10m" });
}

// generate a random subdomain string
export function generateRandomSubdomainString(
  length = parseInt(process.env.SUBDOMAIN_LENGTH) || 5
) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const bytes = crypto.randomBytes(length);

  for (let i = 0; i < length; i++) {
    result += alphabet[bytes[i] % alphabet.length];
  }
  return result;
}

export function sanitizeBaseUrl(url) {
  return url
    .replace(/https?:\/\//, "")
    .replace(/\/$/, "")
    .replace(/:\d+$/, "");
}
