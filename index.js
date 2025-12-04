import express from "express";
import { makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import fs from "fs";
import pino from "pino";

// Correct persistent storage directory
const AUTH_DIR = "/var/data/auth_info";   // <── FINAL FIX

// Ensure folder exists
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 8080;

let sock;
let qrImage = null;
let isConnected = false;

/* ======================================================
   START WHATSAPP SOCKET
====================================================== */
async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    logger: pino({ level: "silent" }),
    auth: state,
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ qr, connection }) => {
    console.log("UPDATE:", { qr: !!qr, connection });

    // QR GENERATED
    if (qr) {
      qrImage = await QRCode.toDataURL(qr);
      isConnected = false;
    }

    // CONNECTED SUCCESSFULLY
    if (connection === "open") {
      console.log("✅ WhatsApp Connected!");
      qrImage = null;
      isConnected = true;
    }

    // DISCONNECTED → restart socket
    if (connection === "close") {
      console.log("❌ Disconnected — restarting in 1s...");
      isConnected = false;
      qrImage = null;

      setTimeout(() => startSock(), 1000);
    }
  });

  return sock;
}

startSock();

/* ======================================================
   ROUTES
====================================================== */

// Home page
app.get("/", (req, res) => {
  res.send(`
    <h1>ONTH WhatsApp Bot</h1>
    <p>Status: ${isConnected ? "Connected ✔️" : "Waiting for QR…"}</p>
    <p><a href="/qr" style="font-size:22px">▶ Show QR</a></p>
  `);
});

// QR route
app.get("/qr", (req, res) => {
  if (!qrImage) {
    return res.send(`
      <h1>No QR available — Not generated or already connected.</h1>
    `);
  }

  res.send(`
    <body style="background:black;display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;color:white">
      <h1>Scan QR</h1>
      <img src="${qrImage}" style="width:300px;border:8px solid white;border-radius:12px" />
    </body>
  `);
});

// Send message
app.post("/send", async (req, res) => {
  try {
    const { number, message } = req.body;
    if (!number) return res.status(400).send("Missing number");

    const jid = number.replace(/\D/g, "") + "@s.whatsapp.net";

    await sock.sendMessage(jid, { text: message || "" });

    res.send({ status: "sent" });
  } catch (err) {
    console.error("SEND ERROR:", err);
    res.status(500).send("Error sending message");
  }
});

app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});
