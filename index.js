import express from "express";
import { makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import fs from "fs";
import pino from "pino";

// Persistent session directory (Render disk)
const AUTH_DIR = "/var/data/auth_info";

if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 8080;

let sock;
let qrImage = null;
let isConnected = false;

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    logger: pino({ level: "silent" }),
    auth: state,
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { qr, connection } = update;

    console.log("UPDATE:", {
      qr: !!qr,
      connection
    });

    if (qr) {
      qrImage = await QRCode.toDataURL(qr);
      isConnected = false;
    }

    if (connection === "open") {
      console.log("✅ WhatsApp Connected");
      qrImage = null;
      isConnected = true;
    }

    if (connection === "close") {
      console.log("❌ Disconnected — restarting...");
      isConnected = false;
      qrImage = null;
      setTimeout(startSock, 1500);
    }
  });
}

startSock();

// Routes
app.get("/", (req, res) => {
  res.send(`
    <h1>ONTH WhatsApp Bot</h1>
    <p>Status: ${isConnected ? "Connected ✔️" : "Waiting for QR…"}</p>
    <p><a href="/qr">Show QR</a></p>
  `);
});

app.get("/qr", (req, res) => {
  if (!qrImage) {
    return res.send("<h1>No QR available — Not generated or already connected.</h1>");
  }

  res.send(`
    <body style="background:black;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;color:white">
      <h1>Scan QR</h1>
      <img src="${qrImage}" style="width:300px;border:10px solid white;border-radius:10px"/>
    </body>
  `);
});

app.listen(PORT, () => console.log("🚀 Server running on", PORT));
