import express from "express";
import baileys from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import fs from "fs";
import pino from "pino";

const { makeWASocket, useMultiFileAuthState, DisconnectReason } = baileys;

// Ensure session folder exists
if (!fs.existsSync("./auth_info")) {
  fs.mkdirSync("./auth_info", { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 8080;

let sock;
let qrImage = null;
let isConnected = false;

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info");

  sock = makeWASocket({
    logger: pino({ level: "silent" }),
    auth: state,
    printQRInTerminal: false
  });

  // Save credentials
  sock.ev.on("creds.update", saveCreds);

  // Connection updates
  sock.ev.on("connection.update", async ({ qr, connection, lastDisconnect }) => {
    console.log("Connection update:", { qr: qr ? "YES" : "NO", connection });

    if (qr) {
      console.log("QR GENERATED");
      qrImage = await QRCode.toDataURL(qr);
      isConnected = false;
    }

    if (connection === "open") {
      console.log("WHATSAPP CONNECTED ✔");
      qrImage = null;
      isConnected = true;
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;

      console.log("Disconnected:", reason);

      // Auto-restart if not logged out
      if (reason !== DisconnectReason.loggedOut) {
        console.log("Reconnecting…");
        startSock();
      } else {
        console.log("Logged OUT — need new QR");
        fs.rmSync("./auth_info", { recursive: true, force: true });
        qrImage = null;
        isConnected = false;
        startSock();
      }
    }
  });
}

startSock();

// ================= ROUTES =================

app.get("/", (req, res) => {
  res.send(`
    <h1>ONTH WhatsApp Bot</h1>
    <p>Status: ${isConnected ? "Connected ✔" : "Waiting for QR…"}</p>
    <p><a href="/qr" style="font-size:24px">▶ Show QR</a></p>
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

  return res.send("<h1>No QR available — Not generated or already connected.</h1>");
});

// ==========================================

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
