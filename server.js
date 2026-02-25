const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MONGODB CONNECTION
mongoose.connect("mongodb+srv://sandu2000cant_db_user:YEui2F3Ky3xoHoBM@medici-epa.5obrsbd.mongodb.net/?appName=MEDICI-EPA")
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.log("DB Error:", err));

// MODEL
const epaSchema = new mongoose.Schema({
    ownerID: { type: String, unique: true }, // Index unic pentru a evita duplicatele
    creator: String,
    partners: Array,
    zone: String,
    vehicle: String,
    startTime: String,
    startTimestamp: Number,
    logs: Array,
    status: { type: String, default: "active" },
    lastSeen: { type: Number, default: Date.now }
});

const EPA = mongoose.model("EPA", epaSchema);

/* ================= HELPER BROADCAST ================= */
const broadcastActiveList = async () => {
    const list = await EPA.find({ status: "active" });
    io.emit("update_global_list", list);
};

/* ================= API ENDPOINTS ================= */

// Listare EPA active (folosit de Polling)
app.get('/api/epa/active-list', async (req, res) => {
    const list = await EPA.find({ status: "active" });
    res.json(list);
});

// Update/Lansare EPA
app.post('/api/epa/update', async (req, res) => {
    try {
        const data = req.body;
        // findOneAndUpdate cu upsert:true face tot: crează dacă nu există, updatează dacă există
        await EPA.findOneAndUpdate(
            { ownerID: data.ownerID },
            { ...data, status: "active", lastSeen: Date.now() },
            { upsert: true, new: true }
        );
        broadcastActiveList();
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Close EPA
app.delete('/api/epa/close/:ownerID', async (req, res) => {
    try {
        await EPA.deleteOne({ ownerID: req.params.ownerID });
        broadcastActiveList();
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

/* ================= SOCKET LOGIC ================= */
io.on("connection", async (socket) => {
    // Trimitem lista imediat la conectare
    const list = await EPA.find({ status: "active" });
    socket.emit("update_global_list", list);

    socket.on("epa_launch", async (data) => {
        if (!data?.ownerID) return;
        await EPA.findOneAndUpdate(
            { ownerID: data.ownerID },
            { ...data, status: "active", lastSeen: Date.now() },
            { upsert: true }
        );
        broadcastActiveList();
    });

    socket.on("epa_close", async (ownerID) => {
        await EPA.deleteOne({ ownerID });
        broadcastActiveList();
    });
});

// Cleanup la 15 min (pentru cei care închid browserul fără clock-out)
setInterval(async () => {
    const expire = Date.now() - (15 * 60 * 1000);
    await EPA.deleteMany({ lastSeen: { $lt: expire } });
    broadcastActiveList();
}, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Radar Medical la port ${PORT}`));