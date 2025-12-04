import express from "express";
import { makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import fs from "fs";
import pino from "pino";

// Create session folder if missing
if (!fs.existsSync("./auth_info")) {
  fs.mkdirSync("./auth_info", { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 8080;

let sock;
let qrImage = null;
let isConnected = false;

// Prevent Railway from restarting early
let hasStarted = false;

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info");

  sock = makeWASocket({
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: state
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ qr, connection }) => {
    console.log("Connection update:", { qr: qr ? "YES" : "NO", connection });

    if (qr) {
      console.log("QR GENERATED!");
      qrImage = await QRCode.toDataURL(qr);
      isConnected = false;
    }

    if (connection === "open") {
      console.log("WHATSAPP CONNECTED!");
      qrImage = null;
      isConnected = true;
    }

    if (connection === "close") {
      console.log("WHATSAPP DISCONNECTED. Waiting for restart…");
      isConnected = false;
      qrImage = null;
    }
  });

  return sock;
}

startSock();

// ================== ROUTES ==================

app.get("/", (req, res) => {
  res.send(`
    <h1>ONTH WhatsApp Bot</h1>
    <p>Status: ${isConnected ? "Connected ✔️" : "Waiting for QR…"}</p>
    <p><a href="/qr" style="font-size:24px">▶ SHOW QR</a></p>
  `);
});

app.get("/qr", (req, res) => {
  if (qrImage) {
    return res.send(`
      <body style="background:black;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;color:white">
        <h1>Scan QR</h1>
        <img src="${qrImage}" style="width:300px;border:8px solid white;border-radius:12px"/>
      </body>
    `);
  }

  return res.send("<h1>No QR available. Not generated yet or already connected.</h1>");
});

// =================================================

app.listen(PORT, () => {
  console.log("Server running on", PORT);
});
