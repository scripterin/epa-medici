/* ================= STATE & CONFIG ================= */
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
let deleteTimeout = null;

let myID = localStorage.getItem('epa_user_id') || 'U-' + Math.floor(Math.random() * 9000 + 1000);
localStorage.setItem('epa_user_id', myID);

/* ================= SISTEM NOTIFICĂRI ================= */
function showNotify(text, type) {
    const n = document.createElement("div");
    n.className = `notify-box notify-${type}`;
    n.style = `position: fixed; top: 20px; right: 20px; padding: 15px 25px; border-radius: 8px; color: white; font-weight: 800; z-index: 10000; background: ${type === 'bad' ? '#ff4d4d' : '#4caf50'}; border-left: 5px solid rgba(0,0,0,0.2); box-shadow: 0 5px 15px rgba(0,0,0,0.3); animation: slideIn 0.3s ease;`;
    n.innerText = text;
    document.body.appendChild(n);
    setTimeout(() => { n.style.opacity = "0"; setTimeout(() => n.remove(), 500); }, 4000);
}

/* ================= RESTRICȚIE: STAFF MINIM ================= */
function checkStaffSafety() {
    if (!myEPA) return;
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
    const vehicleSelect = document.getElementById('vehicle-select');
    if (vehicleSelect) {
        vehicleSelect.innerHTML = VEHICLE_LIST.map(v => `<option value="${v}">${v}</option>`).join('');
    }

    const localData = localStorage.getItem('my_active_epa');
    if (localData) {
        myEPA = JSON.parse(localData);
        renderControlPanel();
        startTimer();
        checkStaffSafety();
        syncWithServer(); // Trimitem puls către server să știe că suntem activi
    }
    
    showSection('active');
    await fetchGlobalData();
    setInterval(fetchGlobalData, 7000); // Polling la 7 secunde pentru radar
};

/* ================= COMUNICARE SERVER (FETCH ÎN LOC DE SOCKET) ================= */

// Cere lista de la MongoDB
async function fetchGlobalData() {
    try {
        const res = await fetch("/api/epa/active-list");
        if (res.ok) {
            const data = await res.json();
            epaStorage = Array.isArray(data) ? data : [];
            renderActiveRadar();
        }
    } catch (e) { console.warn("Eroare radar."); }
}

// Trimite datele noastre către MongoDB
async function syncWithServer() {
    if (!myEPA) return;
    try {
        await fetch("/api/epa/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(myEPA)
        });
    } catch (e) { console.error("Eroare sincronizare server."); }
}

/* ================= NAVIGARE ================= */
function showSection(sectionId) {
    document.querySelectorAll('.section-content').forEach(s => s.style.display = "none");
    const target = document.getElementById("section-" + sectionId);
    if (target) target.style.display = "block";

    document.querySelectorAll(".nav-content button").forEach(b => {
        b.classList.remove("btn-active");
        if (b.getAttribute('onclick') && b.getAttribute('onclick').includes(sectionId)) {
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

    let partnersList = partners.split(',').map(p => p.trim()).filter(p => p).map(p => `M-${p}`);
    if (partnersList.length === 0) return showNotify("Minim 1 partener necesar!", "bad");
    if (partnersList.length > 2) return showNotify("Maxim 3 persoane permise!", "bad");

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
    await syncWithServer(); // Salvează în MongoDB
    
    renderControlPanel();
    startTimer();
    showSection("active");
    fetchGlobalData();
}

/* ================= RANDARE RADAR ================= */
function renderActiveRadar() {
    const container = document.getElementById("epa-list");
    if (!container) return;

    let displayList = [...epaStorage];
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
        timerElem.style = "text-align: center; color: #ffb800; font-weight: 900; margin-bottom: 20px; font-size: 1.4rem; text-shadow: 0 0 10px rgba(255,184,0,0.3);";
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
    const reasonInput = document.getElementById("edit-reason");
    
    reasonInput.value = ""; 
    document.getElementById("edit-title").innerText = "MODIFICĂ " + field.toUpperCase();
    input.value = (field === "partners") ? myEPA.partners.join(",").replace(/M-/g, "") : myEPA[field];
    
    overlay.style.display = "flex";
    
    document.getElementById("save-edit-btn").onclick = async () => {
        const val = input.value;
        const reason = reasonInput.value;
        const now = new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
        
        if (!reason || reason.length < 3) return showNotify("Eroare: Scrie un motiv!", "bad");
        
        if (currentEditField === "partners") {
            let newList = val.split(",").map(p => p.trim()).filter(p => p).map(p => `M-${p}`);
            if (newList.length > 2) return showNotify("Maxim 3 persoane!", "bad");
            myEPA.partners = newList;
        } else {
            myEPA[currentEditField] = val;
        }
        
        myEPA.logs.push(`[${now}] ${currentEditField.toUpperCase()} actualizat. Motiv: ${reason}`);
        localStorage.setItem("my_active_epa", JSON.stringify(myEPA));
        
        await syncWithServer(); // Sincronizăm cu MongoDB
        
        checkStaffSafety();
        renderControlPanel();
        closeEdit();
        fetchGlobalData();
    };
}

function closeEdit() { document.getElementById("custom-edit-overlay").style.display = "none"; }

function confirmClockOut() {
    if (!myEPA) return;
    const diffMin = Math.floor((Date.now() - myEPA.startTimestamp) / 60000);
    document.getElementById("summary-start").querySelector('span').innerText = myEPA.startTime;
    document.getElementById("summary-final").querySelector('span').innerText = new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
    document.getElementById("summary-total").innerText = `TOTAL: ${diffMin} MINUTE`;
    document.getElementById("clockout-overlay").style.display = "flex";
}

async function processClockOut() {
    try {
        await fetch(`/api/epa/close/${myID}`, { method: 'DELETE' });
        localStorage.removeItem("my_active_epa");
        location.reload();
    } catch (e) { showNotify("Eroare la închidere.", "bad"); }
}

function toggleCardDetails(card) {
    const content = card.querySelector(".card-expanded-content");
    if (content) content.style.display = content.style.display === "none" ? "block" : "none";
}

/* ================= EXPORT ================= */
window.showSection = showSection;
window.generateEPA = generateEPA;
window.editField = editField;
window.closeEdit = closeEdit;
window.confirmClockOut = confirmClockOut;
window.closeClockOut = () => document.getElementById("clockout-overlay").style.display = "none";
window.toggleCardDetails = toggleCardDetails;
document.getElementById("confirm-clockout-btn").onclick = processClockOut;