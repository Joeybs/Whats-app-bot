import express from "express";
import { makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import fs from "fs";
import pino from "pino";

const AUTH_DIR = "/var/data/auth_info";

// Ensure persistent folder exists
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 8080;

let sock = null;
let qrImage = null;
let isConnected = false;
let starting = false; // prevents double starts

/* ======================================================
   START WHATSAPP SOCKET
====================================================== */
async function startSock() {
  if (starting) return;
  starting = true;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    sock = makeWASocket({
      logger: pino({ level: "silent" }),
      auth: state,
      printQRInTerminal: false
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async ({ qr, connection }) => {
      console.log("UPDATE:", { qr: !!qr, connection });

      if (qr) {
        qrImage = await QRCode.toDataURL(qr);
        isConnected = false;
      }

      if (connection === "open") {
        console.log("✅ WhatsApp Connected!");
        qrImage = null;
        isConnected = true;
      }

      if (connection === "close") {
        console.log("❌ Disconnected — restarting in 2s...");
        isConnected = false;
        qrImage = null;
        starting = false;

        setTimeout(() => startSock(), 2000);
      }
    });

  } catch (err) {
    console.error("WA INIT ERROR:", err);
    starting = false;
    setTimeout(() => startSock(), 3000);
  }
}

startSock();

/* ======================================================
   ROUTES
====================================================== */

// Home
app.get("/", (req, res) => {
  res.send(`
    <h1>ONTH WhatsApp Bot</h1>
    <p>Status: ${isConnected ? "Connected ✔️" : "Waiting for QR…"}</p>
    <p><a href="/qr" style="font-size:22px">▶ Show QR</a></p>
  `);
});

// QR
app.get("/qr", (req, res) => {
  if (!qrImage) {
    return res.send(`<h1>No QR available — Already connected or loading...</h1>`);
  }

  res.send(`
    <body style="background:black;display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;color:white">
      <h1>Scan QR</h1>
      <img src="${qrImage}" style="width:300px;border:8px solid white;border-radius:12px" />
    </body>
  `);
});

// SEND MESSAGE
app.post("/send", async (req, res) => {
  try {
    if (!sock || !isConnected) {
      return res.status(503).send("WhatsApp not connected");
    }

    let { number, message } = req.body;
    if (!number) return res.status(400).send("Missing number");

    const jid = number.replace(/\D/g, "") + "@s.whatsapp.net";

    await sock.sendMessage(jid, { text: message || "" });

    res.send({ status: "sent" });

  } catch (err) {
    console.error("SEND ERROR:", err);
    res.status(500).send("Send failed");
  }
});

app.listen(PORT, () => {
  console.log("🚀 Server running at http://localhost:" + PORT);
});
