import express from "express";
import { makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import fs from "fs";
import pino from "pino";
import axios from "axios";

// ====== FORCE QR RESET ======
if (fs.existsSync("auth_info")) {
  fs.rmSync("auth_info", { recursive: true, force: true });
  console.log("Old session deleted. Fresh QR will be generated.");
}

// Recreate folder for new login
fs.mkdirSync("auth_info", { recursive: true });

// ============================

// Express setup
const app = express();
app.use(express.json({ limit: "50mb" }));

const PORT = process.env.PORT || 8080; // Railway port
const CHIME_WEBHOOK = "";

// Globals
let sock;
let qrCodeData = "";

// ====== START WHATSAPP SOCKET ======
async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");

  sock = makeWASocket({
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: state
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { qr, connection } = update;

    if (qr) {
      qrCodeData = await QRCode.toDataURL(qr);
      console.log("QR Ready → Visit /qr");
    }

    if (connection === "open") {
      console.log("WhatsApp connected!");
      qrCodeData = ""; // Hide QR when connected
    }
  });

  return sock;
}

startSock();

// ====== ROUTES ======

// QR Page
app.get("/qr", (req, res) => {
  if (!qrCodeData)
    return res.send("<h1>No QR. WhatsApp is connected ✔️</h1>");

  res.send(`
    <body style='display:flex;justify-content:center;align-items:center;height:100vh;background:#111;color:white;flex-direction:column'>
      <h2>Scan QR to connect WhatsApp</h2>
      <img src='${qrCodeData}' style='width:300px;border:10px solid white;border-radius:20px'/>
    </body>
  `);
});

// Root message
app.get("/", (req, res) => res.send("ONTH WhatsApp Bot is Running!"));

// Message Sender
app.post("/send", async (req, res) => {
  try {
    const { number, message } = req.body;
    if (!number) return res.status(400).send("Missing number");

    const jid = number.replace(/\D/g, "") + "@s.whatsapp.net";

    await sock.sendMessage(jid, { text: message || "" });

    res.send({ status: "sent" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Send failed");
  }
});

// Start server
app.listen(PORT, () => console.log("Server running on", PORT));
