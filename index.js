import express from "express";
import pkg from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import fs from "fs";
import pino from "pino";

const { default: makeWASocket, useMultiFileAuthState } = pkg;

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Ensure session folder exists (Render will persist it)
if (!fs.existsSync("./auth_info")) {
  fs.mkdirSync("./auth_info", { recursive: true });
}

let sock;
let qrImage = null;
let isConnected = false;

// ===============================
// START SOCKET
// ===============================
async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info");

  sock = makeWASocket({
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: state,
    syncFullHistory: false
  });

  // Save login
  sock.ev.on("creds.update", saveCreds);

  // Connection updates
  sock.ev.on("connection.update", async ({ qr, connection, lastDisconnect }) => {
    console.log("UPDATE:", { qr: !!qr, connection });

    if (qr) {
      qrImage = await QRCode.toDataURL(qr);
      isConnected = false;
    }

    if (connection === "open") {
      console.log("CONNECTED");
      qrImage = null;
      isConnected = true;
    }

    if (connection === "close") {
      console.log("DISCONNECTED — Restarting...");
      isConnected = false;
      qrImage = null;
      startSock(); // Auto-restart
    }
  });
}

startSock();

// ===============================
// ROUTES
// ===============================

// Status page
app.get("/", (req, res) => {
  res.send(`
    <h1>ONTH WhatsApp Bot</h1>
    <p>Status: ${isConnected ? "Connected ✔️" : "Not Connected ❌"}</p>
    <p><a href="/qr" style="font-size:28px">🔑 Show QR Code</a></p>
  `);
});

// QR route
app.get("/qr", (req, res) => {
  if (qrImage) {
    return res.send(`
      <body style="background:black;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;color:white">
        <h1>Scan WhatsApp QR</h1>
        <img src="${qrImage}" style="width:300px;border:6px solid white;border-radius:12px"/>
      </body>
    `);
  }

  res.send("<h1>No QR available — Not generated yet or already connected.</h1>");
});

// ===============================
// SEND MESSAGE API
// ===============================
app.post("/send", async (req, res) => {
  try {
    const { number, message } = req.body;

    if (!number || !message) {
      return res.status(400).send({ error: "number & message required" });
    }

    const jid = number.replace(/\D/g, "") + "@s.whatsapp.net";
    await sock.sendMessage(jid, { text: message });

    res.send({ status: "sent" });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "failed to send" });
  }
});

// ===============================
// START SERVER
// ===============================
app.listen(PORT, () => console.log("Server running on", PORT));
