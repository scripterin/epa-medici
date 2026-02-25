/* ================= STATE & CONFIG ================= */
let epaStorage = [];
let myEPA = null;
let timerInterval = null;
let currentEditField = ""; 
let syncTimeout = null;

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

/* ================= INIT ================= */
window.onload = async () => {
    // Încărcăm datele noastre din browser
    const localData = localStorage.getItem('my_active_epa');
    if (localData) {
        myEPA = JSON.parse(localData);
        renderControlPanel();
        startTimer();
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

    if (!creator) return alert("Introdu Callsign-ul!");

    const oraStart = new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
    let partnersList = partners.split(',').map(p => p.trim()).filter(p => p).map(p => `M-${p}`);

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
    
    document.getElementById("edit-title").innerText = "MODIFICĂ " + field.toUpperCase();
    input.value = (field === "partners") ? myEPA.partners.join(",").replace(/M-/g, "") : myEPA[field];
    
    overlay.style.display = "flex";
    
    document.getElementById("save-edit-btn").onclick = () => {
        const val = input.value;
        const now = new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
        
        if (currentEditField === "partners") {
            myEPA.partners = val.split(",").map(p => p.trim()).filter(p => p).map(p => `M-${p}`);
        } else {
            myEPA[currentEditField] = val;
        }
        
        myEPA.logs.push(`[${now}] ${currentEditField.toUpperCase()} actualizat.`);
        localStorage.setItem("my_active_epa", JSON.stringify(myEPA));
        
        // Trimitem update-ul și pe server/websocket
        if (socket) socket.emit("epa_launch", myEPA);
        
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