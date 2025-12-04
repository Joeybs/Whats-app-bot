import express from "express";
import { makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import fs from "fs";
import pino from "pino";

const SESSION_FOLDER = "/opt/render/project/src/auth_info";

// Create session folder if missing
if (!fs.existsSync(SESSION_FOLDER)) {
  fs.mkdirSync(SESSION_FOLDER, { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 8080;

let sock;
let qrImage = null;
let isConnected = false;

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER);

  sock = makeWASocket({
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: state
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ qr, connection }) => {
    console.log("UPDATE:", { qr: !!qr, connection });

    if (qr) {
      qrImage = await QRCode.toDataURL(qr);
      isConnected = false;
    }

    if (connection === "open") {
      qrImage = null;
      isConnected = true;
    }

    if (connection === "close") {
      isConnected = false;
      qrImage = null;
    }
  });
}

startSock();

app.get("/qr", (req, res) => {
  if (qrImage) {
    return res.send(`
      <body style="background:black;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;color:white">
        <h1>Scan QR</h1>
        <img src="${qrImage}" style="width:300px;border:8px solid white;border-radius:12px"/>
      </body>
    `);
  }

  res.send("<h1>No QR available — Not generated or already connected.</h1>");
});

app.get("/", (req, res) => {
  res.send(`
    <h1>WhatsApp Bot</h1>
    <p>Status: ${isConnected ? "Connected ✔️" : "Waiting for QR…"}</p>
    <a href="/qr">Show QR</a>
  `);
});

app.listen(PORT, () => console.log("Server running on", PORT));
