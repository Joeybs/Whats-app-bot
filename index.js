import fs from "fs";

// Ensure auth folder exists
if (!fs.existsSync("auth_info")) {
  fs.mkdirSync("auth_info", { recursive: true });
}

import express from "express";
import makeWASocket, { useMultiFileAuthState } from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import fs from "fs";
import pino from "pino";
import axios from "axios";

const app = express();
app.use(express.json({ limit: "50mb" }));

const PORT = process.env.PORT || 3000;
const CHIME_WEBHOOK = "";

let sock;
let qrCodeData = "";

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
      console.log("Scan QR at /qr");
    }
    if (connection === "open") qrCodeData = "";
  });

  return sock;
}

await startSock();

app.get("/qr", (req, res) => {
  if (!qrCodeData) return res.send("<h1>WhatsApp is connected ✔️</h1>");
  res.send(`
    <body style='display:flex;justify-content:center;align-items:center;height:100vh;background:#111;color:white;flex-direction:column'>
      <h2>Scan QR to connect WhatsApp</h2>
      <img src='${qrCodeData}' style='width:300px;border:10px solid white;border-radius:20px'/>
    </body>
  `);
});

app.post("/send", async (req, res) => {
  try {
    const { number, message, mediaUrl } = req.body;
    if (!number) return res.status(400).send("Missing number");

    const jid = number.replace(/\D/g, "") + "@s.whatsapp.net";
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));

    if (mediaUrl) {
      await sock.sendMessage(jid, {
        image: { url: mediaUrl },
        caption: message || ""
      });
    } else {
      await sock.sendMessage(jid, { text: message });
    }

    if (CHIME_WEBHOOK)
      await axios.post(CHIME_WEBHOOK, { Content: `Sent to ${number}: ${message}` });

    res.send({ status: "sent" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error sending message");
  }
});

app.get("/", (req, res) => res.send("ONTH WhatsApp Bot is Running!"));
app.listen(PORT, () => console.log("Server running on port", PORT));
