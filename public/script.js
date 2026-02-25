/* ================= STATE & CONFIG ================= */
// LISTA VEHICULE (Adăugată conform cerinței)
const VEHICLE_LIST = [
    "Bravado Ambulance", "Vapid Speedo", "Brute Ambulance", "Declasse Granger",
    "Pfister Comet", "Dundreary Stalker", "Dundreary Landstalker", "Bravado Gresley",
    "Vapid Caracara", "Bravado Buffalo STX", "DMLS Ratchet", "Manchez",
    "Buckingham Swift", "Buckingham Supervolito", "Gallivanter Baller"
];

let epaStorage = [];
let myEPA = null;
let timerInterval = null;
let currentEditField = ""; 
let syncTimeout = null;
let deleteTimeout = null; // Pentru numărătoarea de 15 secunde

// Identificator unic per browser pentru a diferenția utilizatorii
let myID = localStorage.getItem('epa_user_id') || 'U-' + Math.floor(Math.random() * 9000 + 1000);
localStorage.setItem('epa_user_id', myID);

/* ================= SOCKET.IO (REAL-TIME) ================= */
// Conectare la server - asigură-te că ai <script src="/socket.io/socket.io.js"></script> în HTML
let socket = null;
if (typeof io !== "undefined") {
    socket = io();

    // Ascultăm când serverul trimite lista actualizată către TOATĂ LUMEA
    socket.on("update_global_list", (data) => {
        console.log("Radar actualizat via WebSocket");
        epaStorage = data || [];
        renderActiveRadar();
    });
}

/* ================= SISTEM NOTIFICĂRI CU SUNET ================= */
function showNotify(text, type) {
    // REDARE SUNET DIN HTML
    const alertAudio = document.getElementById('alert-sound');
    if (alertAudio) {
        alertAudio.currentTime = 0;
        alertAudio.play().catch(e => console.warn("Audio block:", e));
    }

    const n = document.createElement("div");
    n.className = `notify-box notify-${type}`;
    n.style = `position: fixed; top: 20px; right: 20px; padding: 15px 25px; border-radius: 8px; color: white; font-weight: 800; z-index: 10000; background: ${type === 'bad' ? '#ff4d4d' : '#4caf50'}; border-left: 5px solid rgba(0,0,0,0.2); box-shadow: 0 5px 15px rgba(0,0,0,0.3); animation: slideIn 0.3s ease;`;
    n.innerText = text;
    document.body.appendChild(n);
    setTimeout(() => { n.style.opacity = "0"; setTimeout(() => n.remove(), 500); }, 4000);
}

/* ================= RESTRICȚIE: VERIFICARE STAFF ACTIV ================= */
function checkStaffSafety() {
    if (!myEPA) return;

    // RESTRICȚIE 2: Verifică dacă ești singur (Tu + 0 parteneri)
    if (myEPA.partners.length === 0) {
        if (!deleteTimeout) {
            showNotify("⚠️ Ești singur! Ai 15 secunde să adaugi un partener sau EPA se șterge!", "bad");
            deleteTimeout = setTimeout(() => {
                if (myEPA && myEPA.partners.length === 0) {
                    showNotify("EPA șters automat: Lipsă personal minim.", "bad");
                    processClockOut();
                }
            }, 15000);
        }
    } else {
        if (deleteTimeout) {
            clearTimeout(deleteTimeout);
            deleteTimeout = null;
            showNotify("Personal minim detectat. Ștergerea a fost anulată.", "good");
        }
    }
}

/* ================= INIT ================= */
window.onload = async () => {
    // POPULARE LISTĂ VEHICULE ÎN SELECT (Adăugat conform cerinței)
    const vehicleSelect = document.getElementById('vehicle-select');
    if (vehicleSelect) {
        vehicleSelect.innerHTML = VEHICLE_LIST.map(v => `<option value="${v}">${v}</option>`).join('');
    }

    // Încărcăm datele noastre din browser
    const localData = localStorage.getItem('my_active_epa');
    if (localData) {
        myEPA = JSON.parse(localData);
        renderControlPanel();
        startTimer();
        checkStaffSafety(); // Verificăm statusul la load
    }
    
    // Deschidem direct radarul
    showSection('active');
    
    // Luăm datele inițiale de pe server
    await fetchGlobalData();
    
    // Verificare periodică (fallback în caz că pică socket-ul)
    setInterval(fetchGlobalData, 15000);
};

/* ================= FETCH DATA (RADAR) ================= */
async function fetchGlobalData() {
    try {
        const res = await fetch("/api/epa/active-list");
        if (res.ok) {
            const data = await res.json();
            epaStorage = Array.isArray(data) ? data : [];
        }
    } catch (e) {
        console.warn("Eroare la fetch global (404/500).");
    }
    renderActiveRadar();
}

/* ================= NAVIGARE ================= */
function showSection(sectionId) {
    document.querySelectorAll('.section-content').forEach(s => s.style.display = "none");
    const target = document.getElementById("section-" + sectionId);
    if (target) target.style.display = "block";

    // Actualizare stil butoane navigație
    document.querySelectorAll(".nav-content button").forEach(b => {
        b.classList.remove("btn-active");
        if (b.getAttribute('onclick').includes(sectionId)) {
            b.classList.add("btn-active");
        }
    });

    if (sectionId === 'active') fetchGlobalData();
}

/* ================= LANSARE EPA ================= */
async function generateEPA() {
    const creator = document.getElementById('creator-id').value;
    const partners = document.getElementById('partners-ids').value;
    const zone = document.getElementById('zone-select').value;
    const vehicle = document.getElementById('vehicle-select').value;

    if (!creator) return showNotify("Eroare: Introdu Callsign-ul tău!", "bad");

    // RESTRICȚIE 1: Minim 2 persoane, Maxim 3 (Tu + parteneri)
    let partnersList = partners.split(',').map(p => p.trim()).filter(p => p).map(p => `M-${p}`);
    
    if (partnersList.length === 0) {
        return showNotify("Restricție: Trebuie să ai minim 1 partener (Echipaj de 2)!", "bad");
    }
    if (partnersList.length > 2) {
        return showNotify("Restricție: Maxim 3 persoane permise într-un EPA!", "bad");
    }

    const oraStart = new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });

    myEPA = {
        ownerID: myID,
        creator: `M-${creator}`,
        partners: partnersList,
        zone: zone,
        vehicle: vehicle,
        startTime: oraStart,
        startTimestamp: Date.now(),
        status: "active",
        logs: [`Echipaj lansat la ${oraStart} de către M-${creator}`]
    };

    localStorage.setItem("my_active_epa", JSON.stringify(myEPA));
    
    // Trimitem prin WebSockets ca toată lumea să vadă noul EPA instant
    if (socket) socket.emit("epa_launch", myEPA);

    showNotify("Echipaj EPA lansat cu succes!", "good"); // Adăugat pentru sunet la start
    renderControlPanel();
    startTimer();
    showSection("active");
}

/* ================= RANDARE RADAR ================= */
function renderActiveRadar() {
    const container = document.getElementById("epa-list");
    if (!container) return;

    // "Local First": Combinăm lista de la server cu propriul EPA ca să nu vedem radarul gol
    let displayList = [...epaStorage];
    if (myEPA && !displayList.find(e => e.ownerID === myID)) {
        displayList.push(myEPA);
    }

    if (displayList.length === 0) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 50px; color: #666;">NU SUNT ECHIPAJE ACTIVE</div>`;
        return;
    }

    container.innerHTML = displayList.map(epa => `
        <div class="epa-card ${epa.ownerID === myID ? "my-card-highlight" : ""}" onclick="toggleCardDetails(this)">
            <div class="card-tag">${epa.zone}</div>
            <h3>🚑 ${epa.creator}</h3>
            <div class="card-time">START: ${epa.startTime}</div>
            <div class="card-expanded-content" style="display:none; border-top: 1px solid rgba(255,255,255,0.1); margin-top: 10px; padding-top: 10px;">
                <p>🚗 <b>Vehicul:</b> ${epa.vehicle}</p>
                <p>👥 <b>Echipaj:</b> ${epa.creator}${epa.partners.length > 0 ? ', ' + epa.partners.join(", ") : ''}</p>
            </div>
        </div>
    `).join("");
}

/* ================= TIMER & CONTROL ================= */
function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    let timerElem = document.getElementById("live-clock");
    if (!timerElem) {
        timerElem = document.createElement("div");
        timerElem.id = "live-clock";
        timerElem.style = "text-align: center; color: #ff9800; font-weight: 900; margin-bottom: 20px; font-size: 1.4rem;";
        document.getElementById("epa-active-control").prepend(timerElem);
    }

    timerInterval = setInterval(() => {
        if (!myEPA) return;
        const diff = Date.now() - myEPA.startTimestamp;
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        timerElem.innerText = `⏱️ TIMP ACTIV: ${h}h ${m}m ${s}s`;
    }, 1000);
}

function renderControlPanel() {
    document.getElementById("epa-creation-form").style.display = "none";
    document.getElementById("epa-active-control").style.display = "block";
    
    document.getElementById("display-zone").innerText = myEPA.zone;
    document.getElementById("display-vehicle").innerText = myEPA.vehicle;
    document.getElementById("display-partners").innerText = myEPA.partners.join(", ") || "Singur";
    
    const logContainer = document.getElementById("log-container");
    if (logContainer) {
        logContainer.innerHTML = myEPA.logs.slice().reverse().map(l => `<div class="log-entry">> ${l}</div>`).join("");
    }
}

/* ================= EDITARE & CLOCK OUT ================= */
function editField(field) {
    if (!myEPA) return;
    currentEditField = field;
    const overlay = document.getElementById("custom-edit-overlay");
    const input = document.getElementById("edit-input");
    
    // RESTRICȚIE 3: Adăugăm câmp de motiv dacă nu există în overlay-ul tău din HTML
    let reasonInput = document.getElementById("edit-reason");
    if (!reasonInput) {
        const group = document.createElement("div");
        group.className = "input-group";
        group.innerHTML = `<label>MOTIV MODIFICARE</label><input type="text" id="edit-reason" placeholder="Ex: Redislocare / Pană">`;
        input.parentNode.after(group);
        reasonInput = document.getElementById("edit-reason");
    }
    reasonInput.value = ""; // Reset motiv
    
    document.getElementById("edit-title").innerText = "MODIFICĂ " + field.toUpperCase();
    input.value = (field === "partners") ? myEPA.partners.join(",").replace(/M-/g, "") : myEPA[field];
    
    overlay.style.display = "flex";
    
    document.getElementById("save-edit-btn").onclick = () => {
        const val = input.value;
        const reason = reasonInput.value;
        const now = new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
        
        // RESTRICȚIE 3: Motivul este obligatoriu
        if (!reason || reason.length < 3) {
            return showNotify("Eroare: Trebuie să scrii un motiv pentru acest edit!", "bad");
        }
        
        if (currentEditField === "partners") {
            let newList = val.split(",").map(p => p.trim()).filter(p => p).map(p => `M-${p}`);
            if (newList.length > 2) return showNotify("Maxim 3 persoane!", "bad");
            myEPA.partners = newList;
        } else {
            myEPA[currentEditField] = val;
        }
        
        myEPA.logs.push(`[${now}] ${currentEditField.toUpperCase()} actualizat. Motiv: ${reason}`);
        localStorage.setItem("my_active_epa", JSON.stringify(myEPA));
        
        // Trimitem update-ul și pe server/websocket
        if (socket) socket.emit("epa_launch", myEPA);
        
        showNotify("Modificare salvată!", "good"); // Sunet la salvare reușită
        checkStaffSafety(); // Verificăm dacă noul edit te-a lăsat singur
        renderControlPanel();
        closeEdit();
    };
}

function closeEdit() { document.getElementById("custom-edit-overlay").style.display = "none"; }

function confirmClockOut() {
    if (!myEPA) return;
    const diffMin = Math.floor((Date.now() - myEPA.startTimestamp) / 60000);
    document.getElementById("summary-start").innerHTML = `START: <span>${myEPA.startTime}</span>`;
    document.getElementById("summary-final").innerHTML = `FINAL: <span>${new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}</span>`;
    document.getElementById("summary-total").innerText = `TOTAL: ${diffMin} MINUTE`;
    document.getElementById("clockout-overlay").style.display = "flex";
}

function closeClockOut() { document.getElementById("clockout-overlay").style.display = "none"; }

async function processClockOut() {
    if (socket) socket.emit("epa_close", myID);
    localStorage.removeItem("my_active_epa");
    location.reload();
}

function toggleCardDetails(card) {
    const content = card.querySelector(".card-expanded-content");
    if (content) content.style.display = content.style.display === "none" ? "block" : "none";
}

/* ================= EXPORT PENTRU HTML ================= */
window.showSection = showSection;
window.generateEPA = generateEPA;
window.editField = editField;
window.closeEdit = closeEdit;
window.confirmClockOut = confirmClockOut;
window.closeClockOut = closeClockOut;
window.toggleCardDetails = toggleCardDetails;
document.getElementById("confirm-clockout-btn").onclick = processClockOut;