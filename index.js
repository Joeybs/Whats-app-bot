import express from "express";
import {
    makeWASocket,
    useSingleFileAuthState,
    Browsers
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import fs from "fs";
import pino from "pino";

const app = express();
const PORT = process.env.PORT || 8080;

// ======== AUTH PERSISTENCE FIX FOR RAILWAY =========
// Load session from ENV (if exists)
const AUTH_ENV = process.env.WA_AUTH_JSON || "{}";

// Create auth.json if missing (Railway wipes filesystem on each boot)
if (!fs.existsSync("auth.json")) {
    fs.writeFileSync("auth.json", AUTH_ENV);
}

// Use single-file state (works on Railway)
const { state, saveState } = useSingleFileAuthState("auth.json");

let sock;
let qrImage = null;
let isConnected = false;

// ===================================================

async function startSock() {
    sock = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        browser: Browsers.macOS("Safari"),
        auth: state
    });

    // Save creds to disk + push into Railway ENV
    sock.ev.on("creds.update", () => {
        saveState();
        const updatedAuth = fs.readFileSync("auth.json", "utf8");

        // Update ENV variable (so Railway keeps session across restarts)
        process.env.WA_AUTH_JSON = updatedAuth;

        console.log("Auth updated into ENV ✔️");
    });

    sock.ev.on("connection.update", async (update) => {
        const { connection, qr } = update;

        console.log("Connection update:", {
            qr: qr ? "YES" : "NO",
            connection
        });

        if (qr) {
            qrImage = await QRCode.toDataURL(qr);
            isConnected = false;
            console.log("QR GENERATED → Visit /qr");
        }

        if (connection === "open") {
            qrImage = null;
            isConnected = true;
            console.log("WHATSAPP CONNECTED ✔️");
        }

        if (connection === "close") {
            isConnected = false;
            qrImage = null;
            console.log("WHATSAPP DISCONNECTED ❌ — Restarting soon…");

            // Automatically restart socket
            setTimeout(startSock, 2000);
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
