// State
let currentView = 'dashboard';
let currentDate = new Date();
let meditationData = JSON.parse(localStorage.getItem('meditationData')) || [];
let timerInterval = null;
let timerSeconds = 0;
let timerDuration = 0;
let currentSessionId = null;
let isEditMode = false;
let settings = JSON.parse(localStorage.getItem('meditationSettings')) || {
    meditationEmoji: '🧘'
};
let currentUser = null;
let useFirebase = false;
let unsubscribeSnapshot = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    if (auth) {
        initAuth();
    } else {
        initOfflineMode();
    }
});

// Firebase Authentication
function initAuth() {
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            useFirebase = true;
            hideAuthModal();
            loadUserData();
            initApp();
        } else {
            currentUser = null;
            useFirebase = false;
            showAuthModal();
        }
    });
}

function showAuthModal() {
    document.getElementById('auth-modal').style.display = 'flex';
    
    document.getElementById('signin-btn').onclick = signIn;
    document.getElementById('signup-btn').onclick = signUp;
    document.getElementById('show-signup').onclick = (e) => {
        e.preventDefault();
        document.getElementById('signin-form').style.display = 'none';
        document.getElementById('signup-form').style.display = 'block';
    };
    document.getElementById('show-signin').onclick = (e) => {
        e.preventDefault();
        document.getElementById('signup-form').style.display = 'none';
        document.getElementById('signin-form').style.display = 'block';
    };
    document.getElementById('continue-offline').onclick = () => {
        hideAuthModal();
        initOfflineMode();
    };
}

function hideAuthModal() {
    document.getElementById('auth-modal').style.display = 'none';
}

function showAuthError(message) {
    const errorDiv = document.getElementById('auth-error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

async function signIn() {
    const email = document.getElementById('signin-email').value;
    const password = document.getElementById('signin-password').value;
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        showAuthError(error.message);
    }
}

async function signUp() {
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    
    if (!name) {
        showAuthError('Please enter your first name');
        return;
    }
    
    if (password.length < 6) {
        showAuthError('Password must be at least 6 characters');
        return;
    }
    
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        // Save user's name to Firestore
        await db.collection('users').doc(userCredential.user.uid).set({
            name: name,
            settings: settings
        }, { merge: true });
    } catch (error) {
        showAuthError(error.message);
    }
}

async function signOut() {
    if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
    }
    await auth.signOut();
}

// Data Management
async function loadUserData() {
    if (!currentUser || !db) return;
    
    // Subscribe to real-time updates
    unsubscribeSnapshot = db.collection('users')
        .doc(currentUser.uid)
        .collection('sessions')
        .onSnapshot((snapshot) => {
            meditationData = [];
            snapshot.forEach((doc) => {
                meditationData.push({ id: doc.id, ...doc.data() });
            });
            updateDashboard();
            renderCalendar();
            updateHistory();
            if (currentView === 'stats') {
                updateStatsView();
            }
        });
    
    // Load settings and user name
    const settingsDoc = await db.collection('users').doc(currentUser.uid).get();
    if (settingsDoc.exists) {
        const data = settingsDoc.data();
        settings = data.settings || settings;
        if (data.name) {
            updateWelcomeName(data.name);
        }
        updateHeaderEmoji();
    }
}

async function saveSession(session) {
    if (useFirebase && currentUser && db) {
        try {
            const docRef = await db.collection('users')
                .doc(currentUser.uid)
                .collection('sessions')
                .add(session);
            return docRef.id;
        } catch (error) {
            console.error('Error saving to Firebase:', error);
            saveToLocalStorage();
        }
    } else {
        saveToLocalStorage();
    }
}

async function updateSession(sessionId, updates) {
    if (useFirebase && currentUser && db) {
        try {
            await db.collection('users')
                .doc(currentUser.uid)
                .collection('sessions')
                .doc(sessionId)
                .update(updates);
        } catch (error) {
            console.error('Error updating Firebase:', error);
            saveToLocalStorage();
        }
    } else {
        const session = meditationData.find(s => s.id === sessionId);
        if (session) {
            Object.assign(session, updates);
            saveToLocalStorage();
        }
    }
}

async function deleteSession(sessionId) {
    if (useFirebase && currentUser && db) {
        try {
            await db.collection('users')
                .doc(currentUser.uid)
                .collection('sessions')
                .doc(sessionId)
                .delete();
        } catch (error) {
            console.error('Error deleting from Firebase:', error);
            deleteFromLocalStorage(sessionId);
        }
    } else {
        deleteFromLocalStorage(sessionId);
    }
}

async function saveSettings() {
    if (useFirebase && currentUser && db) {
        try {
            await db.collection('users')
                .doc(currentUser.uid)
                .set({ settings }, { merge: true });
        } catch (error) {
            console.error('Error saving settings to Firebase:', error);
            localStorage.setItem('meditationSettings', JSON.stringify(settings));
        }
    } else {
        localStorage.setItem('meditationSettings', JSON.stringify(settings));
    }
}

function saveToLocalStorage() {
    localStorage.setItem('meditationData', JSON.stringify(meditationData));
}

function deleteFromLocalStorage(sessionId) {
    meditationData = meditationData.filter(s => s.id !== sessionId);
    saveToLocalStorage();
    updateDashboard();
    updateHistory();
}

function initOfflineMode() {
    useFirebase = false;
    currentUser = null;
    initApp();
}

function initApp() {
    initNavigation();
    initTracker();
    initTimer();
    initModal();
    initSettings();
    updateHeaderEmoji();
    setTodayDate();
    initSignOutButton();
    initWakeLockListener();
    initDailySession();
}

// Re-acquire wake lock when page becomes visible again
function initWakeLockListener() {
    document.addEventListener('visibilitychange', async () => {
        if (wakeLock !== null && document.visibilityState === 'visible' && timerInterval !== null) {
            // Timer is running and page became visible, re-acquire wake lock
            await requestWakeLock();
        }
    });
}

function initSignOutButton() {
    const signOutBtn = document.getElementById('signout-btn');
    if (currentUser) {
        signOutBtn.style.display = 'block';
    } else {
        signOutBtn.style.display = 'none';
    }
    signOutBtn.addEventListener('click', signOut);
}

// Helper function to format minutes into hours and minutes
function formatTime(minutes) {
    if (minutes < 60) {
        return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

// Navigation
function initNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            switchView(view);
        });
    });
}

function switchView(view) {
    currentView = view;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(`${view}-view`).classList.add('active');
    document.querySelector(`[data-view="${view}"]`).classList.add('active');
    
    // Update dashboard when switching to it
    if (view === 'dashboard') {
        updateDashboard();
    }
    
    // Update stats when switching to stats view
    if (view === 'stats') {
        updateStatsView();
    }
    
    // Unlock audio when switching to timer view
    if (view === 'timer') {
        unlockAudio();
    }
    
    // Unlock audio when switching to daily session view
    if (view === 'daily') {
        unlockAudio();
    }
}

function updateStatsView() {
    const currentYear = new Date().getFullYear();
    
    // Filter sessions for current year
    const yearSessions = meditationData.filter(session => {
        const sessionYear = new Date(session.date).getFullYear();
        return sessionYear === currentYear;
    });
    
    // Total minutes
    const totalMinutes = yearSessions.reduce((sum, session) => sum + session.duration, 0);
    document.getElementById('year-total-time').textContent = formatTime(totalMinutes);
    
    // Total sessions
    document.getElementById('year-total-sessions').textContent = yearSessions.length;
    
    // Average duration
    const avgDuration = yearSessions.length > 0 ? 
        Math.round(totalMinutes / yearSessions.length) : 0;
    document.getElementById('year-avg-duration').textContent = formatTime(avgDuration);
    
    // Days meditated
    const uniqueDays = new Set(yearSessions.map(s => s.date));
    document.getElementById('year-days-count').textContent = uniqueDays.size;
    
    // Draw chart
    drawMonthlyChart(yearSessions);
}

function drawMonthlyChart(yearSessions) {
    drawMinutesChart(yearSessions);
    drawDaysChart(yearSessions);
}

function drawMinutesChart(yearSessions) {
    const canvas = document.getElementById('monthlyMinutesChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = 200;
    
    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;
    
    // Calculate monthly data
    const monthlyData = new Array(12).fill(0);
    yearSessions.forEach(session => {
        const month = new Date(session.date).getMonth();
        monthlyData[month] += session.duration;
    });
    
    // Fixed maximum at 30 hours (1800 minutes)
    const maxLabel = 1800;
    const hoursToShow = 30;
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 
                       'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Draw subtle hour grid lines (no labels)
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= hoursToShow; i += 2) {
        const y = height - padding - (i / hoursToShow) * (height - padding * 2);
        
        // Draw grid line
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
    }
    
    // Draw bottom axis line (thicker)
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();
    
    // Draw bars
    const barWidth = (width - padding * 2) / 12;
    ctx.fillStyle = '#c9a96e';
    
    monthlyData.forEach((minutes, index) => {
        if (minutes > 0) {
            const barHeight = (minutes / maxLabel) * (height - padding * 2);
            const x = padding + index * barWidth + barWidth * 0.1;
            const y = height - padding - barHeight;
            const w = barWidth * 0.8;
            
            ctx.fillRect(x, y, w, barHeight);
            
            // Draw minute value on top of bar in time format
            ctx.fillStyle = '#6b6b6b';
            ctx.font = '11px Georgia';
            ctx.textAlign = 'center';
            const displayText = formatTime(minutes);
            ctx.fillText(displayText, x + w / 2, y - 5);
            ctx.fillStyle = '#c9a96e';
        }
    });
    
    // Draw month labels
    ctx.fillStyle = '#6b6b6b';
    ctx.font = '10px Georgia';
    ctx.textAlign = 'center';
    
    monthNames.forEach((month, index) => {
        const x = padding + index * barWidth + barWidth / 2;
        ctx.fillText(month, x, height - padding + 15);
    });
}

function drawDaysChart(yearSessions) {
    const canvas = document.getElementById('monthlyDaysChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = 200;
    
    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;
    
    const currentYear = new Date().getFullYear();
    
    // Calculate days meditated per month
    const monthlyDays = new Array(12).fill(0).map(() => new Set());
    yearSessions.forEach(session => {
        const date = new Date(session.date);
        const month = date.getMonth();
        monthlyDays[month].add(session.date);
    });
    
    const monthlyDaysCounts = monthlyDays.map(set => set.size);
    
    // Get days in each month for current year
    const daysInMonth = [];
    for (let i = 0; i < 12; i++) {
        daysInMonth.push(new Date(currentYear, i + 1, 0).getDate());
    }
    
    const maxDays = Math.max(...daysInMonth);
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 
                       'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Draw axes
    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();
    
    // Draw bars
    const barWidth = (width - padding * 2) / 12;
    
    monthlyDaysCounts.forEach((days, index) => {
        // Draw max days bar (light gray background)
        const maxBarHeight = (daysInMonth[index] / maxDays) * (height - padding * 2);
        const x = padding + index * barWidth + barWidth * 0.1;
        const w = barWidth * 0.8;
        
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(x, height - padding - maxBarHeight, w, maxBarHeight);
        
        // Draw actual days meditated bar
        if (days > 0) {
            const barHeight = (days / maxDays) * (height - padding * 2);
            const y = height - padding - barHeight;
            
            ctx.fillStyle = '#c9a96e';
            ctx.fillRect(x, y, w, barHeight);
            
            // Draw day count on top of bar
            ctx.fillStyle = '#6b6b6b';
            ctx.font = '11px Georgia';
            ctx.textAlign = 'center';
            ctx.fillText(`${days}/${daysInMonth[index]}`, x + w / 2, y - 5);
        }
    });
    
    // Draw month labels
    ctx.fillStyle = '#6b6b6b';
    ctx.font = '10px Georgia';
    ctx.textAlign = 'center';
    
    monthNames.forEach((month, index) => {
        const x = padding + index * barWidth + barWidth / 2;
        ctx.fillText(month, x, height - padding + 15);
    });
}

// Tracker functionality
function initTracker() {
    const form = document.getElementById('meditation-form');
    form.addEventListener('submit', handleFormSubmit);
    
    document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
    document.getElementById('next-month').addEventListener('click', () => changeMonth(1));
    
    updateMonthStats();
    renderCalendar();
    renderHistory();
}

function setTodayDate() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('date').value = today;
}

function handleFormSubmit(e) {
    e.preventDefault();
    
    const duration = parseInt(document.getElementById('duration').value);
    const location = document.getElementById('location').value;
    const date = document.getElementById('date').value;
    const notes = document.getElementById('notes').value;
    
    // Validate monthly limit (100 hours = 6,000 minutes)
    const selectedDate = new Date(date);
    const monthYear = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;
    
    const monthSessions = meditationData.filter(session => {
        const sessionDate = new Date(session.date);
        const sessionMonthYear = `${sessionDate.getFullYear()}-${String(sessionDate.getMonth() + 1).padStart(2, '0')}`;
        return sessionMonthYear === monthYear;
    });
    
    const currentMonthTotal = monthSessions.reduce((sum, s) => sum + s.duration, 0);
    const newTotal = currentMonthTotal + duration;
    
    if (newTotal > 1800) {
        const remaining = 1800 - currentMonthTotal;
        alert(`Cannot add session. Monthly limit is 30 hours.\n\nCurrent month total: ${formatTime(currentMonthTotal)}\nYou can only add ${formatTime(remaining)} more this month.`);
        return;
    }
    
    const session = {
        duration,
        location,
        date,
        notes,
        timestamp: new Date().toISOString()
    };
    
    if (!useFirebase) {
        session.id = Date.now();
        meditationData.push(session);
        saveToLocalStorage();
        updateAfterSessionSave();
    } else {
        saveSession(session).then(() => {
            updateAfterSessionSave();
        });
    }
    
    // Reset form
    e.target.reset();
    setTodayDate();
}

function updateAfterSessionSave() {
    updateDashboard();
    renderCalendar();
    renderHistory();
    switchView('dashboard');
}

function saveData() {
    saveToLocalStorage();
}

function updateDashboard() {
    updateMonthStats();
}

function updateMonthStats() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                       'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    
    // Filter sessions for current month
    const monthSessions = meditationData.filter(session => {
        const sessionDate = new Date(session.date);
        return sessionDate.getFullYear() === currentYear && 
               sessionDate.getMonth() === currentMonth;
    });
    
    // Get unique days meditated this month
    const uniqueDays = new Set(monthSessions.map(s => s.date));
    document.getElementById('month-days-count').textContent = uniqueDays.size;
    
    // Total minutes this month
    const totalMinutes = monthSessions.reduce((sum, session) => sum + session.duration, 0);
    document.getElementById('month-time').textContent = formatTime(totalMinutes);
    document.getElementById('month-label').textContent = `en ${monthNames[currentMonth]}`;
}

// Helper function to format date consistently (YYYY-MM-DD)
function formatDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function changeMonth(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    renderCalendar();
}

function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // Update title
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                       'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    document.getElementById('calendar-title').textContent = `${monthNames[month]} ${year}`;
    
    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Build calendar
    const calendar = document.getElementById('calendar');
    calendar.innerHTML = '';
    
    // Day headers
    const dayHeaders = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    dayHeaders.forEach(day => {
        const header = document.createElement('div');
        header.className = 'calendar-day-header';
        header.textContent = day;
        calendar.appendChild(header);
    });
    
    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day empty';
        calendar.appendChild(emptyCell);
    }
    
    // Days of month
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const sessionsOnDay = meditationData.filter(session => session.date === dateStr);
        const sessionCount = sessionsOnDay.length;
        
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-day';
        
        if (sessionCount > 0) {
            dayCell.classList.add('has-meditation');
            
            // Show meditation icon and up to 3 session dots
            const indicatorCount = Math.min(sessionCount, 3);
            let dots = '';
            for (let i = 0; i < indicatorCount; i++) {
                dots += '<span class="session-dot"></span>';
            }
            
            dayCell.innerHTML = `
                <span class="day-number">${day}</span>
                <span class="meditation-icon">${settings.meditationEmoji}</span>
                <div class="session-indicators">${dots}</div>
            `;
            
            dayCell.style.cursor = 'pointer';
            dayCell.addEventListener('click', () => {
                if (sessionCount === 1) {
                    // Show single session modal
                    showSessionModal(sessionsOnDay[0]);
                } else {
                    // Show day sessions list
                    showDaySessionsModal(dateStr, sessionsOnDay);
                }
            });
        } else {
            dayCell.innerHTML = `<span class="day-number">${day}</span>`;
        }
        
        // Highlight today
        const today = new Date();
        if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
            dayCell.classList.add('today');
        }
        
        calendar.appendChild(dayCell);
    }
}

function renderHistory() {
    const historyList = document.getElementById('history-list');
    const recentSessions = [...meditationData]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 10);
    
    if (recentSessions.length === 0) {
        historyList.innerHTML = '<p class="empty-state">No sessions logged yet. Start your practice today!</p>';
        return;
    }
    
    historyList.innerHTML = recentSessions.map(session => `
        <div class="history-item">
            <div class="history-header">
                <span class="history-date">📆 ${formatDate(session.date)}</span>
                <span class="history-duration">⏱️ ${session.duration} min</span>
            </div>
            ${session.location ? `<div class="history-location">📍 ${session.location}</div>` : ''}
            ${session.notes ? `<div class="history-notes">📝 ${session.notes}</div>` : ''}
        </div>
    `).join('');
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    const options = { month: 'short', day: 'numeric', year: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

// Modal functionality
function initModal() {
    const modal = document.getElementById('session-modal');
    const closeBtn = document.querySelector('.modal-close');
    const editBtn = document.getElementById('modal-edit');
    const saveBtn = document.getElementById('modal-save');
    const cancelBtn = document.getElementById('modal-cancel');
    const deleteBtn = document.getElementById('modal-delete');
    
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    
    editBtn.addEventListener('click', enableEditMode);
    saveBtn.addEventListener('click', saveSessionFromModal);
    cancelBtn.addEventListener('click', cancelEdit);
    deleteBtn.addEventListener('click', () => {
        showConfirmModal(() => deleteSessionFromModal());
    });
    
    // Day sessions modal
    const daySessionsModal = document.getElementById('day-sessions-modal');
    const daySessionsClose = document.querySelector('.day-sessions-close');
    
    daySessionsClose.addEventListener('click', () => {
        daySessionsModal.classList.remove('active');
    });
    daySessionsModal.addEventListener('click', (e) => {
        if (e.target === daySessionsModal) {
            daySessionsModal.classList.remove('active');
        }
    });
    
    // Confirmation modal
    const confirmModal = document.getElementById('confirm-modal');
    document.getElementById('confirm-no').addEventListener('click', () => {
        confirmModal.classList.remove('active');
    });
    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) {
            confirmModal.classList.remove('active');
        }
    });
}

function showDaySessionsModal(dateStr, sessions) {
    const modal = document.getElementById('day-sessions-modal');
    const title = document.getElementById('day-sessions-title');
    const list = document.getElementById('day-sessions-list');
    
    title.textContent = `Sessions on ${formatDate(dateStr)}`;
    
    // Sort sessions by timestamp (most recent first)
    const sortedSessions = [...sessions].sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
    );
    
    list.innerHTML = sortedSessions.map((session, index) => `
        <div class="day-session-item" data-session-id="${session.id}">
            <div class="session-number">Session ${sortedSessions.length - index}</div>
            <div class="session-info">
                <div class="session-duration">${formatTime(session.duration)}</div>
                ${session.location ? `<div class="session-location">📍 ${session.location}</div>` : ''}
                ${session.notes ? `<div class="session-notes">${session.notes}</div>` : ''}
            </div>
            <button class="btn-view-session">View</button>
        </div>
    `).join('');
    
    // Add click handlers to view buttons
    list.querySelectorAll('.btn-view-session').forEach((btn, index) => {
        btn.addEventListener('click', () => {
            modal.classList.remove('active');
            showSessionModal(sortedSessions[index]);
        });
    });
    
    modal.classList.add('active');
}

function showConfirmModal(callback) {
    const confirmModal = document.getElementById('confirm-modal');
    const yesBtn = document.getElementById('confirm-yes');
    
    // Remove old listeners and add new one
    const newYesBtn = yesBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);
    
    newYesBtn.addEventListener('click', () => {
        confirmModal.classList.remove('active');
        callback();
    });
    
    confirmModal.classList.add('active');
}
// Settings functionality
function initSettings() {
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const settingsClose = document.querySelector('.settings-close');
    const emojiOptions = document.querySelectorAll('.emoji-option');
    const nameInput = document.getElementById('settings-name');
    const nameSection = document.getElementById('name-section');
    
    // Open settings
    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.add('active');
        updateEmojiSelection();
        
        // Show name section only if user is signed in
        if (currentUser) {
            nameSection.style.display = 'block';
            loadUserName();
        } else {
            nameSection.style.display = 'none';
        }
    });
    
    // Close settings
    settingsClose.addEventListener('click', () => {
        settingsModal.classList.remove('active');
    });
    
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.remove('active');
        }
    });
    
    // Name input change
    nameInput.addEventListener('blur', async () => {
        const newName = nameInput.value.trim();
        if (newName && currentUser && db) {
            try {
                await db.collection('users').doc(currentUser.uid).set({
                    name: newName
                }, { merge: true });
                updateWelcomeName(newName);
            } catch (error) {
                console.error('Error saving name:', error);
            }
        }
    });
    
    // Emoji selection
    emojiOptions.forEach(btn => {
        btn.addEventListener('click', () => {
            settings.meditationEmoji = btn.dataset.emoji;
            saveSettings();
            updateEmojiSelection();
            updateHeaderEmoji();
            renderCalendar(); // Refresh calendar with new emoji
        });
    });
}

async function loadUserName() {
    if (!currentUser || !db) return;
    
    try {
        const doc = await db.collection('users').doc(currentUser.uid).get();
        if (doc.exists && doc.data().name) {
            document.getElementById('settings-name').value = doc.data().name;
        }
    } catch (error) {
        console.error('Error loading name:', error);
    }
}

function updateHeaderEmoji() {
    const appTitle = document.getElementById('app-title');
    appTitle.textContent = `Registro de Meditación`;
}

function updateWelcomeName(name) {
    const welcomeMessage = document.getElementById('welcome-name');
    const appTitle = document.getElementById('app-title');
    if (name) {
        welcomeMessage.textContent = `¡Hola, ${name}!`;
        welcomeMessage.style.display = 'block';
    } else {
        welcomeMessage.style.display = 'none';
    }
    appTitle.textContent = `Registro de Meditación`;
}

function updateEmojiSelection() {
    document.querySelectorAll('.emoji-option').forEach(btn => {
        if (btn.dataset.emoji === settings.meditationEmoji) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });
}
function showSessionModal(session) {
    currentSessionId = session.id;
    isEditMode = false;
    
    const modal = document.getElementById('session-modal');
    
    // Set values
    document.getElementById('modal-duration').value = session.duration;
    document.getElementById('modal-duration-text').textContent = formatTime(session.duration);
    
    document.getElementById('modal-date').value = session.date;
    document.getElementById('modal-date-text').textContent = formatDate(session.date);
    
    document.getElementById('modal-location').value = session.location || '';
    document.getElementById('modal-location-text').textContent = session.location || 'Not specified';
    
    document.getElementById('modal-notes').value = session.notes || '';
    document.getElementById('modal-notes-text').textContent = session.notes || 'No notes';
    
    // Show in view mode
    showViewMode();
    modal.classList.add('active');
}

function showViewMode() {
    // Hide inputs, show text
    document.querySelectorAll('.modal-field input').forEach(input => {
        input.style.display = 'none';
    });
    document.querySelectorAll('.modal-text').forEach(text => {
        text.style.display = 'block';
    });
    
    // Show edit button, hide save/cancel
    document.getElementById('modal-edit').style.display = 'inline-block';
    document.getElementById('modal-save').style.display = 'none';
    document.getElementById('modal-cancel').style.display = 'none';
}

function enableEditMode() {
    isEditMode = true;
    
    // Show inputs, hide text
    document.querySelectorAll('.modal-field input').forEach(input => {
        input.style.display = 'block';
    });
    document.querySelectorAll('.modal-text').forEach(text => {
        text.style.display = 'none';
    });
    
    // Show save/cancel buttons, hide edit
    document.getElementById('modal-edit').style.display = 'none';
    document.getElementById('modal-save').style.display = 'inline-block';
    document.getElementById('modal-cancel').style.display = 'inline-block';
}

function cancelEdit() {
    const session = meditationData.find(s => s.id === currentSessionId);
    if (session) {
        showSessionModal(session);
    }
}

function saveSessionFromModal() {
    const session = meditationData.find(s => s.id === currentSessionId);
    if (!session) return;
    
    const updates = {
        duration: parseInt(document.getElementById('modal-duration').value),
        date: document.getElementById('modal-date').value,
        location: document.getElementById('modal-location').value,
        notes: document.getElementById('modal-notes').value
    };
    
    if (!useFirebase) {
        Object.assign(session, updates);
        saveToLocalStorage();
    } else {
        updateSession(currentSessionId, updates);
    }
    
    closeModal();
    
    // Update all views
    updateDashboard();
    renderCalendar();
    renderHistory();
}

function deleteSessionFromModal() {
    deleteSession(currentSessionId);
    closeModal();
    
    // Update all views if in offline mode
    if (!useFirebase) {
        updateDashboard();
        renderCalendar();
        renderHistory();
    }
}

function closeModal() {
    document.getElementById('session-modal').classList.remove('active');
    currentSessionId = null;
    isEditMode = false;
}

// Timer functionality
let timerChimeAudio = null;
let timerCalmMusicAudio = null;
let timerMusicEnabled = JSON.parse(localStorage.getItem('timerMusicEnabled')) ?? true;
let timerVibrationEnabled = JSON.parse(localStorage.getItem('timerVibrationEnabled')) ?? true;
let timerPhraseInterval = null;
let timerCurrentPhraseIndex = 0;
let timerCountdownSeconds = 10;
let timerCountdownRunning = false;
let timerSessionRunning = false;
let timerCompletedDuration = 0;
let timerCompleting = false; // Flag to prevent multiple completions
let timerParticleSystem = null;

// Timer customization settings
let timerAnimationStyle = localStorage.getItem('timerAnimationStyle') || 'none';
let timerMusicChoice = localStorage.getItem('timerMusicChoice') || 'ambient';
let timerPreviewAudio = null;
let gradientRotationInterval = null;
let rippleAnimationFrame = null;
let candleAnimationFrame = null;

// Particle System for eroding circle effect - like burning incense
class TimerParticleSystem {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.running = false;
        this.progress = 0;
        this.centerX = 140;
        this.centerY = 140;
        this.radius = 119;
        this.resizeCanvas();
    }
    
    resizeCanvas() {
        const wrapper = this.canvas.parentElement;
        this.canvas.width = wrapper.offsetWidth;
        this.canvas.height = wrapper.offsetHeight;
        this.centerX = this.canvas.width / 2;
        this.centerY = this.canvas.height / 2;
        this.radius = (85 / 200) * this.canvas.width;
    }
    
    start() {
        this.running = true;
        this.particles = [];
        this.progress = 0;
        this.animate();
    }
    
    stop() {
        this.running = false;
        this.particles = [];
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    // Get the position of the burning tip (where the circle is being consumed)
    getBurningTipPosition() {
        // The circle erodes clockwise from the top (12 o'clock = -PI/2)
        // The burning tip is at the END of the remaining circle
        const startAngle = -Math.PI / 2;
        const burningAngle = startAngle + (this.progress * Math.PI * 2);
        
        const x = this.centerX + Math.cos(burningAngle) * this.radius;
        const y = this.centerY + Math.sin(burningAngle) * this.radius;
        return { x, y, angle: burningAngle };
    }
    
    createEmber(x, y) {
        const colors = ['#a8c99a', '#8ab842', '#6b9b3a', '#c4d9a0', '#dcedc8'];
        
        // Tiny ember particles floating up like incense smoke
        this.particles.push({
            x: x + (Math.random() - 0.5) * 6,
            y: y + (Math.random() - 0.5) * 6,
            size: 0.8 + Math.random() * 2, // Tiny particles
            alpha: 0.7 + Math.random() * 0.3,
            color: colors[Math.floor(Math.random() * colors.length)],
            // Float upward and slightly outward
            vy: -(0.2 + Math.random() * 0.6), // Upward
            vx: (Math.random() - 0.5) * 0.4,
            // Gentle drift
            driftSpeed: 0.03 + Math.random() * 0.04,
            driftAmount: 0.3 + Math.random() * 0.6,
            driftOffset: Math.random() * Math.PI * 2,
            life: 1,
            decay: 0.006 + Math.random() * 0.008
        });
    }
    
    update(progress) {
        this.progress = progress;
        
        // Continuously emit particles from the burning tip
        if (this.running && progress > 0 && progress < 1) {
            const tip = this.getBurningTipPosition();
            
            // Emit 2-4 particles per frame from the burning edge
            const emitCount = 2 + Math.floor(Math.random() * 3);
            for (let i = 0; i < emitCount; i++) {
                this.createEmber(tip.x, tip.y);
            }
        }
        
        // Update existing particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            
            // Gentle side-to-side drift like smoke
            p.driftOffset += p.driftSpeed;
            const drift = Math.sin(p.driftOffset) * p.driftAmount;
            
            p.x += p.vx + drift * 0.15;
            p.y += p.vy;
            
            // Gradually slow down vertical movement
            p.vy *= 0.995;
            
            // Fade out
            p.life -= p.decay;
            p.alpha = p.life * 0.8;
            
            // Particles shrink as they fade
            p.size *= 0.997;
            
            if (p.life <= 0 || p.size < 0.2) {
                this.particles.splice(i, 1);
            }
        }
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        for (const p of this.particles) {
            // Draw soft glowing ember particle
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fillStyle = p.color;
            this.ctx.globalAlpha = p.alpha;
            this.ctx.fill();
            
            // Soft outer glow
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size * 1.8, 0, Math.PI * 2);
            this.ctx.fillStyle = p.color;
            this.ctx.globalAlpha = p.alpha * 0.15;
            this.ctx.fill();
        }
        
        this.ctx.globalAlpha = 1;
    }
    
    animate() {
        if (!this.running) return;
        this.update(this.progress);
        this.draw();
        requestAnimationFrame(() => this.animate());
    }
}

function initTimer() {
    // Preload audio files
    timerChimeAudio = new Audio('./chimesnew.wav');
    timerChimeAudio.preload = 'auto';
    timerChimeAudio.load();
    
    timerCalmMusicAudio = new Audio('./calmmusic.mp3');
    timerCalmMusicAudio.loop = true;
    timerCalmMusicAudio.preload = 'auto';
    timerCalmMusicAudio.load();
    
    const timerDisplay = document.getElementById('timer-display');
    
    // Event listeners
    document.getElementById('start-timer').addEventListener('click', startTimerSession);
    document.getElementById('stop-timer').addEventListener('click', stopTimerSession);
    document.getElementById('timer-music-toggle').addEventListener('click', toggleTimerMusic);
    document.getElementById('timer-vibration-toggle').addEventListener('click', toggleTimerVibration);
    document.getElementById('timer-session-form').addEventListener('submit', saveTimerSession);
    document.getElementById('skip-timer-log').addEventListener('click', skipTimerLog);
    
    // Customization panel event listeners
    document.getElementById('timer-customize-btn').addEventListener('click', openCustomizePanel);
    document.getElementById('close-customize-panel').addEventListener('click', closeCustomizePanel);
    document.getElementById('preview-music-btn').addEventListener('click', previewTimerMusic);
    
    // Animation option buttons
    document.querySelectorAll('[data-animation]').forEach(btn => {
        btn.addEventListener('click', () => selectAnimationStyle(btn.dataset.animation));
    });
    
    // Music option buttons
    document.querySelectorAll('[data-music]').forEach(btn => {
        btn.addEventListener('click', () => selectMusicChoice(btn.dataset.music));
    });
    
    // Initialize customization UI state
    updateCustomizationUI();
    
    // Initialize toggle button states
    updateTimerMusicButton();
    updateTimerVibrationButton();
    
    // Make timer display editable
    timerDisplay.addEventListener('focus', function() {
        if (!timerSessionRunning && !timerCountdownRunning) {
            this.select();
        }
    });
    
    timerDisplay.addEventListener('input', function(e) {
        // Only allow digits and colon
        this.value = this.value.replace(/[^0-9:]/g, '');
    });
    
    timerDisplay.addEventListener('blur', function() {
        parseTimerInput();
    });
    
    timerDisplay.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            this.blur();
        }
    });
    
    // Set initial timer display (10 minutes default)
    timerDuration = 10 * 60;
    timerSeconds = timerDuration;
    updateTimerDisplayValue();
    
    // Set today's date in the form
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('timer-log-date').value = today;
}

function parseTimerInput() {
    if (timerSessionRunning || timerCountdownRunning) return;
    
    const input = document.getElementById('timer-display').value;
    const parts = input.split(':');
    
    let minutes = 0;
    let seconds = 0;
    
    if (parts.length === 2) {
        minutes = parseInt(parts[0]) || 0;
        seconds = parseInt(parts[1]) || 0;
    } else if (parts.length === 1) {
        minutes = parseInt(parts[0]) || 0;
    }
    
    // Validate
    seconds = Math.min(Math.max(seconds, 0), 59);
    minutes = Math.max(minutes, 0);
    
    const duration = (minutes * 60) + seconds;
    
    if (duration > 0) {
        timerDuration = duration;
        timerSeconds = duration;
    } else {
        timerDuration = 10 * 60;
        timerSeconds = timerDuration;
    }
    
    updateTimerDisplayValue();
}

function toggleTimerMusic() {
    timerMusicEnabled = !timerMusicEnabled;
    localStorage.setItem('timerMusicEnabled', JSON.stringify(timerMusicEnabled));
    updateTimerMusicButton();
    
    if (!timerMusicEnabled && timerCalmMusicAudio && !timerCalmMusicAudio.paused) {
        timerCalmMusicAudio.pause();
    }
    if (timerMusicEnabled && timerSessionRunning) {
        timerCalmMusicAudio.play().catch(err => console.log('Music play failed:', err));
    }
}

function updateTimerMusicButton() {
    const btn = document.getElementById('timer-music-toggle');
    if (btn) {
        btn.textContent = timerMusicEnabled ? '🎵 Música: On' : '🔇 Música: Off';
        btn.classList.toggle('disabled', !timerMusicEnabled);
    }
}

function toggleTimerVibration() {
    timerVibrationEnabled = !timerVibrationEnabled;
    localStorage.setItem('timerVibrationEnabled', JSON.stringify(timerVibrationEnabled));
    updateTimerVibrationButton();
    
    if (timerVibrationEnabled && 'vibrate' in navigator) {
        navigator.vibrate(100);
    }
}

function updateTimerVibrationButton() {
    const btn = document.getElementById('timer-vibration-toggle');
    if (btn) {
        btn.textContent = timerVibrationEnabled ? '📳 Vibración: On' : '📴 Vibración: Off';
        btn.classList.toggle('disabled', !timerVibrationEnabled);
    }
}

function triggerTimerVibration() {
    if (timerVibrationEnabled && 'vibrate' in navigator) {
        navigator.vibrate(300);
    }
}

function stopTimerSession() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    stopTimerPhraseRotation();
    
    // Stop all animations
    stopTimerAnimation();
    
    // Force close ALL fullscreen modes
    disableCandleMode();
    exitRippleFullscreen();
    exitCosmosFullscreen();
    
    if (timerChimeAudio) {
        timerChimeAudio.pause();
        timerChimeAudio.currentTime = 0;
    }
    if (timerCalmMusicAudio) {
        timerCalmMusicAudio.pause();
        timerCalmMusicAudio.currentTime = 0;
        timerCalmMusicAudio.volume = 1.0;
    }
    
    releaseWakeLock();
    resetTimerSession();
}

function startTimerSession() {
    if (timerSessionRunning || timerCountdownRunning) return;
    
    // Close customization panel when starting
    closeCustomizePanel();
    
    timerCountdownRunning = true;
    timerCountdownSeconds = 10;
    timerCompletedDuration = timerDuration;
    
    requestWakeLock();
    
    audioUnlocked = true;
    timerChimeAudio.currentTime = 0;
    timerChimeAudio.play().catch(err => console.log('Chime play failed:', err));
    
    // Update UI for countdown
    const startBtn = document.getElementById('start-timer');
    const stopBtn = document.getElementById('stop-timer');
    startBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
    
    const timerDisplay = document.getElementById('timer-display');
    timerDisplay.disabled = true;
    timerDisplay.classList.add('pre-countdown');
    
    document.getElementById('timer-label').textContent = 'Ponte cómodo...';
    document.getElementById('timer-glow-circle').classList.add('breathing');
    document.getElementById('timer-hint').textContent = 'Cierra los ojos y respira profundamente';
    
    // Show countdown
    document.getElementById('timer-display').value = '00:10';
    
    timerInterval = setInterval(updateTimerCountdown, 1000);
}

function updateTimerCountdown() {
    timerCountdownSeconds--;
    
    document.getElementById('timer-display').value = 
        `00:${String(timerCountdownSeconds).padStart(2, '0')}`;
    
    if (timerCountdownSeconds <= 0) {
        clearInterval(timerInterval);
        timerCountdownRunning = false;
        startMainTimer();
    }
}

function startMainTimer() {
    timerSessionRunning = true;
    timerSeconds = timerDuration;
    
    // Switch from pre-countdown to running class
    const timerDisplay = document.getElementById('timer-display');
    timerDisplay.classList.remove('pre-countdown');
    timerDisplay.classList.add('running');
    
    if (timerMusicEnabled && timerMusicChoice !== 'silence') {
        timerCalmMusicAudio.currentTime = 0;
        timerCalmMusicAudio.volume = 0;
        timerCalmMusicAudio.play().catch(err => console.log('Music play failed:', err));
        fadeInTimerMusic();
    }
    
    // Start the selected animation style
    startTimerAnimation();
    
    // Start rotating phrases
    timerCurrentPhraseIndex = 0;
    updateTimerPhrase();
    startTimerPhraseRotation();
    
    document.getElementById('timer-hint').textContent = 'Concéntrate en tu respiración';
    
    updateTimerDisplayValue();
    document.getElementById('timer-progress-circle').style.strokeDashoffset = 0;
    
    timerInterval = setInterval(updateTimerTick, 1000);
}

function startTimerPhraseRotation() {
    timerPhraseInterval = setInterval(() => {
        rotateTimerPhrase();
    }, 30000);
}

function rotateTimerPhrase() {
    const label = document.getElementById('timer-label');
    
    label.classList.add('fade-out');
    label.classList.remove('fade-in');
    
    setTimeout(() => {
        timerCurrentPhraseIndex = (timerCurrentPhraseIndex + 1) % meditationPhrases.length;
        label.textContent = meditationPhrases[timerCurrentPhraseIndex];
        label.classList.remove('fade-out');
        label.classList.add('fade-in');
    }, 500);
}

function updateTimerPhrase() {
    const label = document.getElementById('timer-label');
    label.textContent = meditationPhrases[timerCurrentPhraseIndex];
    label.classList.add('fade-in');
}

function stopTimerPhraseRotation() {
    if (timerPhraseInterval) {
        clearInterval(timerPhraseInterval);
        timerPhraseInterval = null;
    }
}

function updateTimerTick() {
    if (timerSeconds > 0) {
        timerSeconds--;
        updateTimerDisplayValue();
        updateTimerProgress();
        
        // Check if we just hit zero - play chime immediately but let circle complete
        if (timerSeconds === 0) {
            // Play chime RIGHT NOW at 00:00
            timerChimeAudio.currentTime = 0;
            timerChimeAudio.play().catch(err => {
                console.log('Chime play failed, trying backup:', err);
                const backup = new Audio('./chimesnew.wav');
                backup.play().catch(e => console.log('Backup chime failed:', e));
            });
            
            // Small delay to let the circle animation visually complete, then finish session
            setTimeout(() => {
                completeTimerSession();
            }, 300);
        }
    }
}

function updateTimerDisplayValue() {
    const minutes = Math.floor(timerSeconds / 60);
    const seconds = timerSeconds % 60;
    document.getElementById('timer-display').value = 
        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateTimerProgress() {
    const progress = (timerDuration - timerSeconds) / timerDuration;
    const circumference = 2 * Math.PI * 85;
    const offset = circumference * (1 - progress);
    document.getElementById('timer-progress-circle').style.strokeDashoffset = offset;
    
    // Update particle system progress - it will emit from the burning tip
    if (timerParticleSystem) {
        timerParticleSystem.progress = progress;
    }
}

function fadeInTimerMusic() {
    const fadeDuration = 4000; // 4 seconds
    const fadeSteps = 20;
    const targetVolume = 1.0;
    let currentStep = 0;
    
    const fadeInterval = setInterval(() => {
        currentStep++;
        timerCalmMusicAudio.volume = Math.min((currentStep / fadeSteps) * targetVolume, targetVolume);
        
        if (currentStep >= fadeSteps) {
            timerCalmMusicAudio.volume = targetVolume;
            clearInterval(fadeInterval);
        }
    }, fadeDuration / fadeSteps);
}

function fadeOutTimerMusic(callback) {
    const fadeDuration = 5000; // 5 seconds
    const fadeSteps = 25;
    const fadeInterval = setInterval(() => {
        if (timerCalmMusicAudio.volume > 0.04) {
            timerCalmMusicAudio.volume -= (1.0 / fadeSteps);
        } else {
            timerCalmMusicAudio.volume = 0;
            timerCalmMusicAudio.pause();
            clearInterval(fadeInterval);
            if (callback) callback();
        }
    }, fadeDuration / fadeSteps); // Fade over 5 seconds
}

// Robust chime player - ensures chime always plays at timer completion
// Uses multiple strategies including Web Audio API for mobile reliability
function playCompletionChime() {
    console.log('🔔 Playing completion chime...');
    
    // Strategy 1: Web Audio API (most reliable for mobile/fullscreen)
    const playWithWebAudio = () => {
        return new Promise((resolve, reject) => {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Resume context in case it's suspended (common on mobile)
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }
            
            fetch('./chimesnew.wav')
                .then(response => response.arrayBuffer())
                .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
                .then(audioBuffer => {
                    const source = audioContext.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(audioContext.destination);
                    source.start(0);
                    console.log('🔔 Chime playing via Web Audio API');
                    resolve();
                })
                .catch(reject);
        });
    };
    
    // Strategy 2: Fresh Audio element (backup)
    const playFreshAudio = () => {
        return new Promise((resolve, reject) => {
            const freshChime = new Audio('./chimesnew.wav');
            freshChime.preload = 'auto';
            freshChime.volume = 1.0;
            
            // Force load before playing
            freshChime.load();
            
            freshChime.oncanplaythrough = () => {
                freshChime.play()
                    .then(() => {
                        console.log('🔔 Chime playing via fresh Audio element');
                        resolve();
                    })
                    .catch(reject);
            };
            
            // Timeout fallback if loading takes too long
            setTimeout(() => {
                freshChime.play().catch(reject);
            }, 100);
        });
    };
    
    // Strategy 3: Existing audio element (last resort)
    const playExisting = () => {
        return new Promise((resolve, reject) => {
            if (timerChimeAudio) {
                timerChimeAudio.currentTime = 0;
                timerChimeAudio.volume = 1.0;
                timerChimeAudio.play()
                    .then(() => {
                        console.log('🔔 Chime playing via existing element');
                        resolve();
                    })
                    .catch(reject);
            } else {
                reject(new Error('No chime audio element'));
            }
        });
    };
    
    // Try all strategies in sequence
    playWithWebAudio()
        .catch(err => {
            console.log('Web Audio failed, trying fresh Audio:', err.message);
            return playFreshAudio();
        })
        .catch(err => {
            console.log('Fresh Audio failed, trying existing:', err.message);
            return playExisting();
        })
        .catch(err => {
            console.log('All chime strategies failed:', err.message);
            // Absolute last resort: delayed retry
            setTimeout(() => {
                const lastResort = new Audio('./chimesnew.wav');
                lastResort.play().catch(e => console.log('Final attempt failed:', e));
            }, 200);
        });
}

function completeTimerSession() {
    // Prevent multiple completions
    if (timerCompleting) return;
    timerCompleting = true;
    
    // Chime already played in updateTimerTick() when hitting 00:00
    
    // Now stop the timer
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    stopTimerPhraseRotation();
    releaseWakeLock();
    timerSessionRunning = false;
    
    // Close the customization panel if open
    closeCustomizePanel();
    
    // Trigger vibration immediately
    triggerTimerVibration();
    
    // Stop all animations
    stopTimerAnimation();
    
    // Force close ALL fullscreen modes (timer is complete)
    disableCandleMode();
    exitRippleFullscreen();
    exitCosmosFullscreen();
    
    // Fade out music over 5 seconds (in parallel, don't block)
    if (timerMusicEnabled && !timerCalmMusicAudio.paused) {
        fadeOutTimerMusic();
    }
    
    // Show completion screen immediately
    showTimerCompletionScreen();
}

function showTimerCompletionScreen() {
    // Update completion stats
    const completedMinutes = Math.floor(timerCompletedDuration / 60);
    const completedSeconds = timerCompletedDuration % 60;
    let statsText = '';
    if (completedMinutes > 0) {
        statsText = `${completedMinutes} minuto${completedMinutes !== 1 ? 's' : ''}`;
        if (completedSeconds > 0) {
            statsText += ` ${completedSeconds} segundo${completedSeconds !== 1 ? 's' : ''}`;
        }
    } else {
        statsText = `${completedSeconds} segundo${completedSeconds !== 1 ? 's' : ''}`;
    }
    statsText += ' de meditación';
    document.getElementById('timer-complete-stats').textContent = statsText;
    
    // Set today's date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('timer-log-date').value = today;
    
    // Switch to log mode
    document.getElementById('timer-session-mode').style.display = 'none';
    document.getElementById('timer-log-mode').style.display = 'flex';
    
    // Reset the completing flag after a delay
    setTimeout(() => {
        timerCompleting = false;
    }, 1000);
}

async function saveTimerSession(e) {
    e.preventDefault();
    
    const completedMinutes = Math.floor(timerCompletedDuration / 60);
    
    const session = {
        duration: completedMinutes,
        date: document.getElementById('timer-log-date').value,
        location: document.getElementById('timer-log-location').value || '',
        notes: document.getElementById('timer-log-notes').value || ''
    };
    
    if (useFirebase && currentUser) {
        await db.collection('users')
            .doc(currentUser.uid)
            .collection('sessions')
            .add(session);
    } else {
        session.id = Date.now().toString();
        meditationData.push(session);
        localStorage.setItem('meditationData', JSON.stringify(meditationData));
        updateDashboard();
        renderCalendar();
        updateHistory();
    }
    
    resetTimerSession();
    showToast('¡Sesión guardada exitosamente!');
    switchView('dashboard');
}

function skipTimerLog() {
    resetTimerSession();
}

// Timer Customization Functions
function openCustomizePanel() {
    document.getElementById('timer-customize-panel').style.display = 'block';
}

function closeCustomizePanel() {
    document.getElementById('timer-customize-panel').style.display = 'none';
    stopMusicPreview();
}

function selectAnimationStyle(style) {
    timerAnimationStyle = style;
    localStorage.setItem('timerAnimationStyle', style);
    
    // Update UI
    document.querySelectorAll('[data-animation]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.animation === style);
    });
    
    // If timer is running, swap the animation live
    if (timerSessionRunning) {
        stopTimerAnimation();
        startTimerAnimation();
    }
}

function selectMusicChoice(music) {
    timerMusicChoice = music;
    localStorage.setItem('timerMusicChoice', music);
    
    // Update UI
    document.querySelectorAll('[data-music]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.music === music);
    });
    
    // Update the music audio source
    updateTimerMusicSource();
    
    // If timer is running and music is enabled, swap the music live
    if (timerSessionRunning && timerMusicEnabled) {
        timerCalmMusicAudio.currentTime = 0;
        timerCalmMusicAudio.volume = 1.0;
        timerCalmMusicAudio.play().catch(err => console.log('Music play failed:', err));
    }
}

function updateTimerMusicSource() {
    const musicFiles = {
        'ambient': './calmmusic.mp3',
        'naturaleza': './naturaleza.mp3',
        'mar': './mar.mp3'
    };
    
    if (musicFiles[timerMusicChoice]) {
        timerMusicEnabled = true;
        timerCalmMusicAudio.src = musicFiles[timerMusicChoice];
        timerCalmMusicAudio.load();
        updateTimerMusicButton();
    }
}

function previewTimerMusic() {
    const btn = document.getElementById('preview-music-btn');
    
    if (timerPreviewAudio && !timerPreviewAudio.paused) {
        stopMusicPreview();
        return;
    }
    
    const musicFiles = {
        'ambient': './calmmusic.mp3',
        'naturaleza': './naturaleza.mp3',
        'mar': './mar.mp3'
    };
    
    if (!musicFiles[timerMusicChoice]) {
        return;
    }
    
    timerPreviewAudio = new Audio(musicFiles[timerMusicChoice]);
    timerPreviewAudio.volume = 0.5;
    timerPreviewAudio.play().catch(err => console.log('Preview failed:', err));
    
    btn.textContent = '⏹️ Parar';
    
    // Stop preview after 20 seconds
    setTimeout(() => {
        stopMusicPreview();
    }, 20000);
}

function stopMusicPreview() {
    if (timerPreviewAudio) {
        timerPreviewAudio.pause();
        timerPreviewAudio = null;
    }
    document.getElementById('preview-music-btn').textContent = '▶️ Escuchar';
}

function updateCustomizationUI() {
    // Set active states based on saved preferences
    document.querySelectorAll('[data-animation]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.animation === timerAnimationStyle);
    });
    
    document.querySelectorAll('[data-music]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.music === timerMusicChoice);
    });
    
    // Update music source
    updateTimerMusicSource();
}

// Animation implementations
function startTimerAnimation() {
    stopTimerAnimation(); // Clear any existing animation
    
    const glowCircle = document.getElementById('timer-glow-circle');
    const progressCircle = document.getElementById('timer-progress-circle');
    
    switch (timerAnimationStyle) {
        case 'breathing':
            glowCircle.classList.add('breathing');
            break;
            
        case 'gradient':
            startGradientRotation();
            break;
            
        case 'ripple':
            enterRippleFullscreen();
            break;
            
        case 'candle':
            enableCandleMode();
            startCandleAnimation();
            break;
            
        case 'cosmos':
            enterCosmosFullscreen();
            break;
            
        case 'none':
        default:
            // No animation
            break;
    }
}

function stopTimerAnimation() {
    const glowCircle = document.getElementById('timer-glow-circle');
    glowCircle.classList.remove('breathing');
    
    if (gradientRotationInterval) {
        clearInterval(gradientRotationInterval);
        gradientRotationInterval = null;
    }
    
    if (rippleAnimationFrame) {
        cancelAnimationFrame(rippleAnimationFrame);
        rippleAnimationFrame = null;
    }
    
    // Stop candle animation
    if (candleAnimationFrame) {
        cancelAnimationFrame(candleAnimationFrame);
        candleAnimationFrame = null;
    }
    
    // Stop cosmos animation
    if (cosmosAnimationFrame) {
        cancelAnimationFrame(cosmosAnimationFrame);
        cosmosAnimationFrame = null;
    }
    
    // Only disable fullscreen modes if they're not the selected animation
    // (prevents exiting fullscreen when countdown ends and main timer starts)
    if (timerAnimationStyle !== 'candle') {
        disableCandleMode();
    }
    if (timerAnimationStyle !== 'ripple') {
        exitRippleFullscreen();
    }
    if (timerAnimationStyle !== 'cosmos') {
        exitCosmosFullscreen();
    }
    
    // Clear the canvas to remove any frozen animation frames
    const canvas = document.getElementById('timer-particle-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    
    // Stop particle system
    if (timerParticleSystem) {
        timerParticleSystem.stop();
        timerParticleSystem = null;
    }
}

function startGradientRotation() {
    let rotation = 0;
    const progressCircle = document.getElementById('timer-progress-circle');
    
    gradientRotationInterval = setInterval(() => {
        rotation += 1;
        progressCircle.style.filter = `hue-rotate(${rotation % 360}deg)`;
    }, 50);
}

function startRippleAnimation() {
    const canvas = document.getElementById('timer-particle-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const wrapper = canvas.parentElement;
    
    // Canvas is 200% of wrapper size, positioned at -50%
    canvas.width = wrapper.offsetWidth * 2;
    canvas.height = wrapper.offsetHeight * 2;
    
    // Center is in the middle of the larger canvas
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    // Starting radius matches the timer circle (scaled for the wrapper size)
    const startRadius = (85 / 200) * wrapper.offsetWidth;
    
    let ripples = [];
    let lastRippleTime = 0;
    
    function addRipple() {
        ripples.push({
            radius: startRadius,
            alpha: 0.35,
            lineWidth: 2.5
        });
    }
    
    function animateRipples(timestamp) {
        if (!rippleAnimationFrame) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Add new ripple every 3.5 seconds for calmer effect
        if (timestamp - lastRippleTime > 3500) {
            addRipple();
            lastRippleTime = timestamp;
        }
        
        // Update and draw ripples
        for (let i = ripples.length - 1; i >= 0; i--) {
            const r = ripples[i];
            
            r.radius += 0.25; // Slower expansion
            r.alpha -= 0.001; // Slower fade so ripples travel further
            r.lineWidth *= 0.999;
            
            if (r.alpha <= 0) {
                ripples.splice(i, 1);
                continue;
            }
            
            ctx.beginPath();
            ctx.arc(centerX, centerY, r.radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(138, 184, 66, ${r.alpha})`;
            ctx.lineWidth = r.lineWidth;
            ctx.stroke();
        }
        
        rippleAnimationFrame = requestAnimationFrame(animateRipples);
    }
    
    addRipple();
    rippleAnimationFrame = requestAnimationFrame(animateRipples);
}

// Candle mode functions
let candleFullscreenActive = false;
let candlePhraseInterval = null;
let steamParticles = [];

const soothingPhrases = [
    "Respira profundamente...",
    "Deja ir las tensiones...",
    "Estás en paz...",
    "Cada respiración te calma...",
    "Siente la tranquilidad...",
    "El momento presente es todo...",
    "Suelta los pensamientos...",
    "Tu mente está serena...",
    "Confía en el proceso...",
    "Todo está bien...",
    "Acepta este momento...",
    "La calma te envuelve..."
];

function enableCandleMode() {
    document.body.classList.add('candle-mode');
}

function disableCandleMode() {
    document.body.classList.remove('candle-mode');
    // Only exit fullscreen if we're actually in fullscreen mode
    if (candleFullscreenActive) {
        exitCandleFullscreen();
    }
}

function enterCandleFullscreen() {
    // Prevent double-entry
    if (candleFullscreenActive) return;
    
    const overlay = document.getElementById('candle-fullscreen-overlay');
    if (!overlay) return;
    
    candleFullscreenActive = true;
    overlay.style.display = 'flex';
    
    // Setup canvas
    const canvas = document.getElementById('candle-fullscreen-canvas');
    canvas.width = window.innerWidth * 2;
    canvas.height = window.innerHeight * 2;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    
    // Sync timer display
    syncCandleTimerDisplay();
    
    // Fade in after a brief delay
    setTimeout(() => {
        overlay.classList.add('visible');
    }, 50);
    
    // Start floating phrases (change every 30 seconds)
    showRandomPhrase();
    candlePhraseInterval = setInterval(showRandomPhrase, 30000);
    
    // Setup exit button - stops the timer session when exiting candle mode
    document.getElementById('candle-exit-btn').onclick = () => {
        // Stop the timer session first
        if (timerSessionRunning) {
            document.getElementById('stop-timer').click();
        }
        // Always exit candle fullscreen when X is clicked
        disableCandleMode();
    };
    
    // Start fullscreen candle animation
    startFullscreenCandleAnimation();
}

function exitCandleFullscreen() {
    // Only exit if we're actually in fullscreen
    if (!candleFullscreenActive) return;
    
    const overlay = document.getElementById('candle-fullscreen-overlay');
    if (!overlay) return;
    
    candleFullscreenActive = false;
    overlay.classList.remove('visible');
    
    // Clear phrase interval
    if (candlePhraseInterval) {
        clearInterval(candlePhraseInterval);
        candlePhraseInterval = null;
    }
    
    // Clear steam particles
    steamParticles = [];
    
    // Stop candle animation
    if (candleAnimationFrame) {
        cancelAnimationFrame(candleAnimationFrame);
        candleAnimationFrame = null;
    }
    
    // Hide after fade out (3 seconds to match CSS transition)
    setTimeout(() => {
        overlay.style.display = 'none';
    }, 3000);
}

// Handle window resize for candle fullscreen
window.addEventListener('resize', () => {
    if (candleFullscreenActive) {
        const canvas = document.getElementById('candle-fullscreen-canvas');
        if (canvas) {
            canvas.width = window.innerWidth * 2;
            canvas.height = window.innerHeight * 2;
        }
    }
});

function syncCandleTimerDisplay() {
    const mainDisplay = document.getElementById('timer-display');
    const candleDisplay = document.getElementById('candle-timer-display');
    const candleProgress = document.getElementById('candle-progress-circle');
    const mainProgress = document.getElementById('timer-progress-circle');
    
    if (mainDisplay && candleDisplay) {
        candleDisplay.textContent = mainDisplay.value;
    }
    
    if (mainProgress && candleProgress) {
        candleProgress.style.strokeDashoffset = mainProgress.style.strokeDashoffset;
    }
}

function showRandomPhrase() {
    const phraseEl = document.getElementById('candle-phrase');
    if (!phraseEl) return;
    
    // Fade out
    phraseEl.classList.remove('visible');
    
    setTimeout(() => {
        const randomPhrase = soothingPhrases[Math.floor(Math.random() * soothingPhrases.length)];
        phraseEl.textContent = randomPhrase;
        phraseEl.classList.add('visible');
    }, 1000);
}

function startFullscreenCandleAnimation() {
    const canvas = document.getElementById('candle-fullscreen-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Steam particles array
    steamParticles = [];
    
    let time = 0;
    
    function createSteamParticle(candleX, candleBaseY) {
        return {
            x: candleX + (Math.random() - 0.5) * 60,
            y: candleBaseY - 160,
            vx: (Math.random() - 0.5) * 0.5,
            vy: -0.4 - Math.random() * 0.4,
            size: 3 + Math.random() * 6,
            alpha: 0.08 + Math.random() * 0.12,
            life: 1
        };
    }
    
    function drawFullscreenCandle() {
        if (!candleFullscreenActive) return;
        
        // Get timer circle position to align candle with it
        const timerContent = document.querySelector('.candle-timer-content');
        const canvasRect = canvas.getBoundingClientRect();
        
        // Candle X is always horizontally centered (same as timer)
        const candleX = canvas.width / 2;
        
        // Position candle below the timer circle
        // Timer is at 15% from top + timer height (~180px) + some spacing
        // The candle base should be positioned so the flame is below the timer
        const timerBottomPercent = 0.15 + 0.15; // 15% top position + ~15% for timer height
        const candleBaseY = canvas.height * 0.55; // Position candle in lower half, aligned with timer
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        time += 0.03;
        
        // Flicker variables (doubled for larger candle)
        const flickerX = Math.sin(time * 3) * 12 + Math.sin(time * 7) * 6;
        const flickerY = Math.sin(time * 4) * 8;
        const flickerScale = 0.95 + Math.sin(time * 5) * 0.05 + Math.random() * 0.02;
        
        // Draw large ambient glow (doubled)
        const ambientRadius = 600 * flickerScale;
        const ambientGradient = ctx.createRadialGradient(
            candleX, candleBaseY - 160,
            20,
            candleX, candleBaseY - 160,
            ambientRadius
        );
        ambientGradient.addColorStop(0, 'rgba(255, 160, 60, 0.15)');
        ambientGradient.addColorStop(0.3, 'rgba(255, 120, 40, 0.08)');
        ambientGradient.addColorStop(0.6, 'rgba(255, 80, 20, 0.03)');
        ambientGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.beginPath();
        ctx.arc(candleX, candleBaseY - 160, ambientRadius, 0, Math.PI * 2);
        ctx.fillStyle = ambientGradient;
        ctx.fill();
        
        // Draw candle body (doubled: 50->100, 120->240)
        const candleWidth = 100;
        const candleHeight = 240;
        const candleGradient = ctx.createLinearGradient(
            candleX - candleWidth/2, candleBaseY,
            candleX + candleWidth/2, candleBaseY
        );
        candleGradient.addColorStop(0, '#d4c4a8');
        candleGradient.addColorStop(0.3, '#e8d5b5');
        candleGradient.addColorStop(0.5, '#f5e6d3');
        candleGradient.addColorStop(0.7, '#e8d5b5');
        candleGradient.addColorStop(1, '#c4b498');
        
        ctx.beginPath();
        // Use fillRect for broader compatibility (roundRect may not be supported)
        ctx.fillStyle = candleGradient;
        ctx.fillRect(candleX - candleWidth/2, candleBaseY, candleWidth, candleHeight);
        
        // Candle top (melted wax edge - doubled)
        ctx.beginPath();
        ctx.ellipse(candleX, candleBaseY, candleWidth/2, 16, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#f5e6d3';
        ctx.fill();
        
        // Draw wick (doubled)
        ctx.beginPath();
        ctx.moveTo(candleX, candleBaseY - 10);
        ctx.lineTo(candleX + flickerX * 0.2, candleBaseY - 40);
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 8;
        ctx.stroke();
        
        // Draw flame - outer glow (doubled)
        const glowRadius = 200 * flickerScale;
        const glowGradient = ctx.createRadialGradient(
            candleX + flickerX * 0.3, candleBaseY - 100 + flickerY,
            10,
            candleX + flickerX * 0.3, candleBaseY - 100 + flickerY,
            glowRadius
        );
        glowGradient.addColorStop(0, 'rgba(255, 200, 100, 0.6)');
        glowGradient.addColorStop(0.3, 'rgba(255, 150, 50, 0.3)');
        glowGradient.addColorStop(0.6, 'rgba(255, 100, 30, 0.1)');
        glowGradient.addColorStop(1, 'rgba(255, 80, 20, 0)');
        
        ctx.beginPath();
        ctx.arc(candleX + flickerX * 0.3, candleBaseY - 100 + flickerY, glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = glowGradient;
        ctx.fill();
        
        // Draw flame - outer (doubled: 70->140, 18->36, 25->50, 15->30)
        const flameHeight = 140 * flickerScale;
        ctx.beginPath();
        ctx.moveTo(candleX - 36 + flickerX * 0.2, candleBaseY - 30);
        ctx.quadraticCurveTo(
            candleX - 50 + flickerX, candleBaseY - flameHeight * 0.5 + flickerY,
            candleX + flickerX * 0.6, candleBaseY - flameHeight + flickerY * 0.5
        );
        ctx.quadraticCurveTo(
            candleX + 50 + flickerX, candleBaseY - flameHeight * 0.5 + flickerY,
            candleX + 36 + flickerX * 0.2, candleBaseY - 30
        );
        ctx.closePath();
        
        const outerFlameGradient = ctx.createLinearGradient(
            candleX, candleBaseY - 30,
            candleX, candleBaseY - flameHeight
        );
        outerFlameGradient.addColorStop(0, '#ff5500');
        outerFlameGradient.addColorStop(0.3, '#ff7700');
        outerFlameGradient.addColorStop(0.6, '#ffaa00');
        outerFlameGradient.addColorStop(0.85, '#ffdd44');
        outerFlameGradient.addColorStop(1, '#fffbe6');
        ctx.fillStyle = outerFlameGradient;
        ctx.fill();
        
        // Draw flame - inner core (doubled: 8->16, 12->24, 18->36)
        const innerFlameHeight = flameHeight * 0.55;
        ctx.beginPath();
        ctx.moveTo(candleX - 16 + flickerX * 0.15, candleBaseY - 36);
        ctx.quadraticCurveTo(
            candleX - 24 + flickerX * 0.4, candleBaseY - innerFlameHeight * 0.5 + flickerY * 0.4,
            candleX + flickerX * 0.4, candleBaseY - innerFlameHeight + flickerY * 0.2
        );
        ctx.quadraticCurveTo(
            candleX + 24 + flickerX * 0.4, candleBaseY - innerFlameHeight * 0.5 + flickerY * 0.4,
            candleX + 16 + flickerX * 0.15, candleBaseY - 36
        );
        ctx.closePath();
        
        const innerFlameGradient = ctx.createLinearGradient(
            candleX, candleBaseY - 36,
            candleX, candleBaseY - innerFlameHeight
        );
        innerFlameGradient.addColorStop(0, '#ffcc33');
        innerFlameGradient.addColorStop(0.4, '#ffee88');
        innerFlameGradient.addColorStop(0.7, '#fffacc');
        innerFlameGradient.addColorStop(1, '#ffffff');
        ctx.fillStyle = innerFlameGradient;
        ctx.fill();
        
        // Update and draw steam particles
        if (Math.random() < 0.15) {
            steamParticles.push(createSteamParticle());
        }
        
        for (let i = steamParticles.length - 1; i >= 0; i--) {
            const p = steamParticles[i];
            
            // Update position with gentle swaying
            p.x += p.vx + Math.sin(time * 2 + i) * 0.3;
            p.y += p.vy;
            p.life -= 0.003;
            p.size += 0.05;
            p.alpha = p.life * 0.12;
            
            if (p.life <= 0) {
                steamParticles.splice(i, 1);
                continue;
            }
            
            // Draw steam wisp
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(200, 190, 180, ${p.alpha})`;
            ctx.fill();
        }
        
        // Limit steam particles
        if (steamParticles.length > 30) {
            steamParticles = steamParticles.slice(-30);
        }
        
        // Sync timer display
        syncCandleTimerDisplay();
        
        candleAnimationFrame = requestAnimationFrame(drawFullscreenCandle);
    }
    
    drawFullscreenCandle();
}

function startCandleAnimation() {
    // For candle mode, we use fullscreen instead
    enterCandleFullscreen();
}

// Ripple/Ondas Zen fullscreen mode functions
let rippleFullscreenActive = false;
let ripplePhraseInterval = null;
let rippleFullscreenAnimFrame = null;
let glowingCircles = [];

function enterRippleFullscreen() {
    // Prevent double-entry
    if (rippleFullscreenActive) return;
    
    const overlay = document.getElementById('ripple-fullscreen-overlay');
    if (!overlay) return;
    
    rippleFullscreenActive = true;
    overlay.style.display = 'flex';
    
    // Setup canvas
    const canvas = document.getElementById('ripple-fullscreen-canvas');
    canvas.width = window.innerWidth * 2;
    canvas.height = window.innerHeight * 2;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    
    // Sync timer display
    syncRippleTimerDisplay();
    
    // Fade in after a brief delay
    setTimeout(() => {
        overlay.classList.add('visible');
    }, 50);
    
    // Start floating phrases (change every 30 seconds)
    showRandomRipplePhrase();
    ripplePhraseInterval = setInterval(showRandomRipplePhrase, 30000);
    
    // Setup exit button - stops the timer session when exiting
    document.getElementById('ripple-exit-btn').onclick = () => {
        // Stop the timer session first
        if (timerSessionRunning) {
            document.getElementById('stop-timer').click();
        }
        // Always exit ripple fullscreen when X is clicked
        exitRippleFullscreen();
    };
    
    // Start fullscreen ripple animation
    startFullscreenRippleAnimation();
}

function exitRippleFullscreen() {
    // Only exit if we're actually in fullscreen
    if (!rippleFullscreenActive) return;
    
    const overlay = document.getElementById('ripple-fullscreen-overlay');
    if (!overlay) return;
    
    rippleFullscreenActive = false;
    overlay.classList.remove('visible');
    
    // Clear phrase interval
    if (ripplePhraseInterval) {
        clearInterval(ripplePhraseInterval);
        ripplePhraseInterval = null;
    }
    
    // Clear glowing circles
    glowingCircles = [];
    
    // Stop ripple animation
    if (rippleFullscreenAnimFrame) {
        cancelAnimationFrame(rippleFullscreenAnimFrame);
        rippleFullscreenAnimFrame = null;
    }
    
    // Hide after fade out (3 seconds to match CSS transition)
    setTimeout(() => {
        overlay.style.display = 'none';
    }, 3000);
}

// Handle window resize for ripple fullscreen
window.addEventListener('resize', () => {
    if (rippleFullscreenActive) {
        const canvas = document.getElementById('ripple-fullscreen-canvas');
        if (canvas) {
            const oldCenterX = canvas.width / 2;
            const oldCenterY = canvas.height / 2;
            
            canvas.width = window.innerWidth * 2;
            canvas.height = window.innerHeight * 2;
            
            const newCenterX = canvas.width / 2;
            const newCenterY = canvas.height / 2;
            
            // Update all existing circle positions to new center
            for (const circle of glowingCircles) {
                circle.x = newCenterX;
                circle.y = newCenterY;
            }
        }
    }
});

function syncRippleTimerDisplay() {
    const mainDisplay = document.getElementById('timer-display');
    const rippleDisplay = document.getElementById('ripple-timer-display');
    const rippleProgress = document.getElementById('ripple-progress-circle');
    const mainProgress = document.getElementById('timer-progress-circle');
    
    if (mainDisplay && rippleDisplay) {
        rippleDisplay.textContent = mainDisplay.value;
    }
    
    if (mainProgress && rippleProgress) {
        rippleProgress.style.strokeDashoffset = mainProgress.style.strokeDashoffset;
    }
}

function showRandomRipplePhrase() {
    const phraseEl = document.getElementById('ripple-phrase');
    if (!phraseEl) return;
    
    // Fade out
    phraseEl.classList.remove('visible');
    
    setTimeout(() => {
        const randomPhrase = soothingPhrases[Math.floor(Math.random() * soothingPhrases.length)];
        phraseEl.textContent = randomPhrase;
        phraseEl.classList.add('visible');
    }, 1000);
}

function startFullscreenRippleAnimation() {
    const canvas = document.getElementById('ripple-fullscreen-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Initialize glowing circles
    glowingCircles = [];
    
    let time = 0;
    let lastRippleTime = 0;
    const rippleInterval = 6; // Spawn a new ripple every 6 seconds (in time units)
    
    // Create a new glowing ripple circle
    function createGlowingCircle() {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        
        // Different blue shades - cycle through them in order for consistency
        const blueShades = [
            { r: 100, g: 180, b: 255 },  // Light blue
            { r: 60, g: 140, b: 220 },   // Medium blue
            { r: 80, g: 200, b: 255 },   // Cyan blue
            { r: 40, g: 100, b: 180 },   // Deep blue
            { r: 120, g: 200, b: 240 },  // Sky blue
            { r: 70, g: 160, b: 230 }    // Ocean blue
        ];
        
        const shadeIndex = glowingCircles.length % blueShades.length;
        const shade = blueShades[shadeIndex];
        
        return {
            x: centerX,
            y: centerY,
            radius: 30,  // Consistent starting radius
            maxRadius: 500,  // Consistent max radius
            growSpeed: 0.4,  // Consistent speed for predictable rhythm
            alpha: 0.55,
            color: shade,
            pulseOffset: time  // Use current time for synchronized pulsing
        };
    }
    
    // Pre-populate with evenly spaced circles
    for (let i = 0; i < 4; i++) {
        const circle = createGlowingCircle();
        circle.radius = 30 + (i * 120);  // Evenly spaced
        circle.alpha = 0.5 - (i * 0.1);
        glowingCircles.push(circle);
    }
    
    function drawRipples() {
        if (!rippleFullscreenActive) return;
        
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        
        // Clear with slight fade for trail effect
        ctx.fillStyle = 'rgba(10, 22, 40, 0.12)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        time += 0.02;
        
        // Spawn new circles on a consistent time pattern (every ~4 seconds)
        if (time - lastRippleTime >= rippleInterval && glowingCircles.length < 6) {
            glowingCircles.push(createGlowingCircle());
            lastRippleTime = time;
        }
        
        // Draw ambient center glow
        const ambientGradient = ctx.createRadialGradient(
            centerX, centerY, 10,
            centerX, centerY, 400
        );
        ambientGradient.addColorStop(0, 'rgba(100, 180, 255, 0.25)');
        ambientGradient.addColorStop(0.3, 'rgba(70, 140, 220, 0.12)');
        ambientGradient.addColorStop(0.6, 'rgba(50, 100, 180, 0.05)');
        ambientGradient.addColorStop(1, 'rgba(20, 50, 100, 0)');
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, 400, 0, Math.PI * 2);
        ctx.fillStyle = ambientGradient;
        ctx.fill();
        
        // Update and draw glowing circles
        for (let i = glowingCircles.length - 1; i >= 0; i--) {
            const circle = glowingCircles[i];
            
            // Grow the circle
            circle.radius += circle.growSpeed;
            
            // Calculate alpha based on radius (fade as it grows)
            const progress = circle.radius / circle.maxRadius;
            const pulseAmount = Math.sin(time * 2 + circle.pulseOffset) * 0.1;
            circle.alpha = (1 - progress) * 0.5 * (1 + pulseAmount);
            
            // Remove if too large or faded
            if (circle.radius >= circle.maxRadius || circle.alpha <= 0) {
                glowingCircles.splice(i, 1);
                continue;
            }
            
            // Draw the glowing circle
            const { r, g, b } = circle.color;
            
            // Outer glow
            const glowGradient = ctx.createRadialGradient(
                circle.x, circle.y, circle.radius - 20,
                circle.x, circle.y, circle.radius + 60
            );
            glowGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
            glowGradient.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${circle.alpha * 0.4})`);
            glowGradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${circle.alpha * 0.6})`);
            glowGradient.addColorStop(0.8, `rgba(${r}, ${g}, ${b}, ${circle.alpha * 0.3})`);
            glowGradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
            
            ctx.beginPath();
            ctx.arc(circle.x, circle.y, circle.radius + 60, 0, Math.PI * 2);
            ctx.fillStyle = glowGradient;
            ctx.fill();
            
            // Inner ring
            ctx.beginPath();
            ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${r + 50}, ${g + 30}, ${b}, ${circle.alpha * 0.8})`;
            ctx.lineWidth = 3 + (1 - progress) * 4;
            ctx.stroke();
        }
        
        // Draw subtle floating particles (original style)
        for (let i = 0; i < 20; i++) {
            const angle = (time * 0.3 + i * 0.5) % (Math.PI * 2);
            const distance = 150 + Math.sin(time + i) * 100 + i * 25;
            const x = centerX + Math.cos(angle) * distance;
            const y = centerY + Math.sin(angle) * distance;
            const size = 2 + Math.sin(time * 2 + i) * 1.5;
            const alpha = 0.3 + Math.sin(time * 3 + i * 0.7) * 0.2;
            
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(150, 200, 255, ${alpha})`;
            ctx.fill();
        }
        
        // Sync timer display
        syncRippleTimerDisplay();
        
        rippleFullscreenAnimFrame = requestAnimationFrame(drawRipples);
    }
    
    drawRipples();
}

function startRippleFullscreenAnimation() {
    // For ripple mode, we use fullscreen
    enterRippleFullscreen();
}

// Cosmos/Starfield fullscreen mode functions
let cosmosFullscreenActive = false;
let cosmosPhraseInterval = null;
let cosmosAnimationFrame = null;
let stars = [];
let shootingStars = [];

function enterCosmosFullscreen() {
    // Prevent double-entry
    if (cosmosFullscreenActive) return;
    
    const overlay = document.getElementById('cosmos-fullscreen-overlay');
    if (!overlay) return;
    
    cosmosFullscreenActive = true;
    overlay.style.display = 'flex';
    
    // Setup canvas
    const canvas = document.getElementById('cosmos-fullscreen-canvas');
    canvas.width = window.innerWidth * 2;
    canvas.height = window.innerHeight * 2;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    
    // Sync timer display
    syncCosmosTimerDisplay();
    
    // Fade in after a brief delay
    setTimeout(() => {
        overlay.classList.add('visible');
    }, 50);
    
    // Start floating phrases (change every 30 seconds)
    showRandomCosmosPhrase();
    cosmosPhraseInterval = setInterval(showRandomCosmosPhrase, 30000);
    
    // Setup exit button
    document.getElementById('cosmos-exit-btn').onclick = () => {
        if (timerSessionRunning) {
            document.getElementById('stop-timer').click();
        }
        exitCosmosFullscreen();
    };
    
    // Start fullscreen cosmos animation
    startFullscreenCosmosAnimation();
}

function exitCosmosFullscreen() {
    if (!cosmosFullscreenActive) return;
    
    const overlay = document.getElementById('cosmos-fullscreen-overlay');
    if (!overlay) return;
    
    cosmosFullscreenActive = false;
    overlay.classList.remove('visible');
    
    if (cosmosPhraseInterval) {
        clearInterval(cosmosPhraseInterval);
        cosmosPhraseInterval = null;
    }
    
    stars = [];
    shootingStars = [];
    
    if (cosmosAnimationFrame) {
        cancelAnimationFrame(cosmosAnimationFrame);
        cosmosAnimationFrame = null;
    }
    
    // Hide after fade out (3 seconds to match CSS transition)
    setTimeout(() => {
        overlay.style.display = 'none';
    }, 3000);
}

// Handle window resize for cosmos fullscreen
window.addEventListener('resize', () => {
    if (cosmosFullscreenActive) {
        const canvas = document.getElementById('cosmos-fullscreen-canvas');
        if (canvas) {
            canvas.width = window.innerWidth * 2;
            canvas.height = window.innerHeight * 2;
            // Regenerate stars for new canvas size
            initializeStars(canvas);
        }
    }
});

function syncCosmosTimerDisplay() {
    const mainDisplay = document.getElementById('timer-display');
    const cosmosDisplay = document.getElementById('cosmos-timer-display');
    const cosmosProgress = document.getElementById('cosmos-progress-circle');
    const mainProgress = document.getElementById('timer-progress-circle');
    
    if (mainDisplay && cosmosDisplay) {
        cosmosDisplay.textContent = mainDisplay.value;
    }
    
    if (mainProgress && cosmosProgress) {
        cosmosProgress.style.strokeDashoffset = mainProgress.style.strokeDashoffset;
    }
}

function showRandomCosmosPhrase() {
    const phraseEl = document.getElementById('cosmos-phrase');
    if (!phraseEl) return;
    
    phraseEl.classList.remove('visible');
    
    setTimeout(() => {
        const randomPhrase = soothingPhrases[Math.floor(Math.random() * soothingPhrases.length)];
        phraseEl.textContent = randomPhrase;
        phraseEl.classList.add('visible');
    }, 1000);
}

function initializeStars(canvas) {
    stars = [];
    const starCount = Math.floor((canvas.width * canvas.height) / 5000);
    
    // Variety of star colors based on stellar classification
    const starColors = [
        { r: 255, g: 255, b: 255 },   // White
        { r: 255, g: 250, b: 240 },   // Warm white
        { r: 255, g: 220, b: 180 },   // Yellow/orange (like our sun)
        { r: 255, g: 200, b: 150 },   // Orange
        { r: 255, g: 180, b: 180 },   // Red giant
        { r: 180, g: 200, b: 255 },   // Blue-white
        { r: 150, g: 180, b: 255 },   // Blue
        { r: 200, g: 255, b: 255 },   // Cyan/teal
        { r: 255, g: 230, b: 255 },   // Pink/magenta
        { r: 230, g: 255, b: 200 },   // Pale green
    ];
    
    for (let i = 0; i < starCount; i++) {
        const colorIndex = Math.floor(Math.random() * starColors.length);
        // Depth-based movement - smaller/dimmer stars move slower (parallax)
        const depth = Math.random(); // 0 = far, 1 = close
        const size = 0.5 + depth * 2;
        
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: size,
            brightness: 0.4 + depth * 0.5,
            twinkleSpeed: 0.01 + Math.random() * 0.02, // Slower, subtler twinkle
            twinkleOffset: Math.random() * Math.PI * 2,
            color: starColors[colorIndex],
            // Movement - drift slowly across screen
            speed: 0.1 + depth * 0.4, // Closer stars move faster (parallax effect)
            depth: depth
        });
    }
}

function startFullscreenCosmosAnimation() {
    const canvas = document.getElementById('cosmos-fullscreen-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Initialize stars
    initializeStars(canvas);
    
    let time = 0;
    let lastShootingStarTime = 0;
    const shootingStarInterval = 5; // New shooting star every ~5 seconds
    
    function createShootingStar() {
        const startX = Math.random() * canvas.width * 0.8;
        const startY = Math.random() * canvas.height * 0.3;
        
        return {
            x: startX,
            y: startY,
            speed: 8 + Math.random() * 6,
            angle: Math.PI / 4 + (Math.random() - 0.5) * 0.3,
            length: 80 + Math.random() * 60,
            alpha: 1,
            life: 1
        };
    }
    
    function drawCosmos() {
        if (!cosmosFullscreenActive) return;
        
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        
        // Clear canvas with deep space background
        ctx.fillStyle = '#000008';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        time += 0.02;
        
        // Draw and move stars
        for (const star of stars) {
            // Move star slowly to the left (drifting through space)
            star.x -= star.speed;
            
            // Wrap around when star goes off screen
            if (star.x < -10) {
                star.x = canvas.width + 10;
                star.y = Math.random() * canvas.height;
            }
            
            // Subtle twinkle (gentle sine wave)
            const twinkle = 0.7 + 0.3 * Math.sin(time * star.twinkleSpeed * 30 + star.twinkleOffset);
            const alpha = star.brightness * twinkle;
            
            const { r, g, b } = star.color;
            
            // Star glow for larger/closer stars
            if (star.size > 1.5) {
                ctx.beginPath();
                ctx.arc(star.x, star.y, star.size * 2.5, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.12})`;
                ctx.fill();
            }
            
            // Star core
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
            ctx.fill();
        }
        
        // Spawn shooting stars periodically
        if (time - lastShootingStarTime >= shootingStarInterval && shootingStars.length < 2) {
            shootingStars.push(createShootingStar());
            lastShootingStarTime = time;
        }
        
        // Update and draw shooting stars
        for (let i = shootingStars.length - 1; i >= 0; i--) {
            const ss = shootingStars[i];
            
            // Move shooting star
            ss.x += Math.cos(ss.angle) * ss.speed;
            ss.y += Math.sin(ss.angle) * ss.speed;
            ss.life -= 0.015;
            ss.alpha = ss.life;
            
            if (ss.life <= 0 || ss.x > canvas.width || ss.y > canvas.height) {
                shootingStars.splice(i, 1);
                continue;
            }
            
            // Draw shooting star trail
            const tailX = ss.x - Math.cos(ss.angle) * ss.length;
            const tailY = ss.y - Math.sin(ss.angle) * ss.length;
            
            const gradient = ctx.createLinearGradient(ss.x, ss.y, tailX, tailY);
            gradient.addColorStop(0, `rgba(255, 255, 255, ${ss.alpha})`);
            gradient.addColorStop(0.1, `rgba(200, 220, 255, ${ss.alpha * 0.8})`);
            gradient.addColorStop(0.4, `rgba(150, 180, 255, ${ss.alpha * 0.3})`);
            gradient.addColorStop(1, 'rgba(100, 150, 255, 0)');
            
            ctx.beginPath();
            ctx.moveTo(ss.x, ss.y);
            ctx.lineTo(tailX, tailY);
            ctx.strokeStyle = gradient;
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Bright head
            ctx.beginPath();
            ctx.arc(ss.x, ss.y, 2, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${ss.alpha})`;
            ctx.fill();
        }
        
        // Sync timer display
        syncCosmosTimerDisplay();
        
        cosmosAnimationFrame = requestAnimationFrame(drawCosmos);
    }
    
    drawCosmos();
}

function resetTimerSession() {
    if (timerCalmMusicAudio) {
        timerCalmMusicAudio.pause();
        timerCalmMusicAudio.volume = 1.0;
    }
    
    // Close customize panel if open
    closeCustomizePanel();
    
    // Clear the particle/ripple canvas
    const canvas = document.getElementById('timer-particle-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    
    document.getElementById('timer-log-location').value = '';
    document.getElementById('timer-log-notes').value = '';
    
    timerSeconds = timerDuration;
    timerCountdownSeconds = 10;
    timerSessionRunning = false;
    timerCountdownRunning = false;
    updateTimerDisplayValue();
    document.getElementById('timer-progress-circle').style.strokeDashoffset = 0;
    document.getElementById('timer-progress-circle').style.filter = 'none'; // Reset gradient rotation
    
    const startBtn = document.getElementById('start-timer');
    const stopBtn = document.getElementById('stop-timer');
    startBtn.style.display = 'inline-block';
    stopBtn.style.display = 'none';
    
    const timerDisplay = document.getElementById('timer-display');
    timerDisplay.disabled = false;
    timerDisplay.classList.remove('running', 'pre-countdown');
    
    document.getElementById('timer-label').textContent = 'Toca para editar';
    document.getElementById('timer-label').classList.remove('fade-in', 'fade-out');
    document.getElementById('timer-glow-circle').classList.remove('breathing');
    document.getElementById('timer-hint').textContent = 'Encuentra un lugar tranquilo y ponte cómodo';
    
    document.getElementById('timer-log-mode').style.display = 'none';
    document.getElementById('timer-session-mode').style.display = 'flex';
}

// Toast notification
function showToast(message, icon = '✨') {
    const toast = document.getElementById('toast');
    const toastMessage = toast.querySelector('.toast-message');
    const toastIcon = toast.querySelector('.toast-icon');
    
    toastMessage.textContent = message;
    toastIcon.textContent = icon;
    
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Chime sound
let chimeSound = null;
let audioUnlocked = false;

function generateBellSound() {
    // Preload the chime sound for faster playback
    chimeSound = new Audio('./chime.wav');
    chimeSound.load();
}

// Screen Wake Lock to prevent screen from sleeping during timer
let wakeLock = null;

async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake lock activated');
            
            wakeLock.addEventListener('release', () => {
                console.log('Wake lock released');
            });
        } catch (err) {
            console.log('Wake lock failed:', err);
        }
    }
}

async function releaseWakeLock() {
    if (wakeLock !== null) {
        await wakeLock.release();
        wakeLock = null;
        console.log('Wake lock released manually');
    }
}

function unlockAudio() {
    if (audioUnlocked) return;
    
    // Play a very soft sound to unlock audio context on mobile
    const unlockSound = new Audio('./chime.wav');
    unlockSound.volume = 0.05; // Very soft but slightly audible
    unlockSound.play().then(() => {
        audioUnlocked = true;
        console.log('Audio unlocked successfully');
    }).catch(err => {
        console.log('Audio unlock pending - will try on next interaction');
    });
}

function playBellSound() {
    // Create a new Audio instance each time to avoid playback issues
    const sound = new Audio('./chime.wav');
    sound.volume = 1.0;
    sound.play().catch(err => console.log('Audio play failed:', err));
}

function testSound() {
    // Unlock audio and play the chime
    audioUnlocked = true;
    playBellSound();
}

// Daily Session functionality
let dailySessionInterval = null;
let dailySessionSeconds = 600; // 10 minutes
let dailySessionDuration = 600;
let dailyCountdownSeconds = 10; // 10 second countdown
let dailySessionRunning = false;
let dailyCountdownRunning = false;
let dailyChimeAudio = null;
let dailyCalmMusicAudio = null;
let dailyMusicEnabled = JSON.parse(localStorage.getItem('dailyMusicEnabled')) ?? true;
let dailyVibrationEnabled = JSON.parse(localStorage.getItem('dailyVibrationEnabled')) ?? true;
let dailyPhraseInterval = null;
let currentPhraseIndex = 0;

const meditationPhrases = [
    "Respira profundamente...",
    "Deja ir los pensamientos...",
    "Estás en paz...",
    "Siente tu respiración...",
    "El momento presente es todo...",
    "Relaja tu cuerpo...",
    "Observa sin juzgar...",
    "Acepta lo que sientes...",
    "Conecta con tu interior...",
    "La calma está en ti...",
    "Suelta las tensiones...",
    "Simplemente respira...",
    "Estás aquí y ahora...",
    "Encuentra tu centro...",
    "Deja fluir la energía...",
    "Confía en el proceso...",
    "Eres suficiente...",
    "Abraza la quietud...",
    "Siente la serenidad...",
    "Gratitud por este momento..."
];

function initDailySession() {
    // Preload audio files
    dailyChimeAudio = new Audio('./chimesnew.wav');
    dailyChimeAudio.load();
    
    dailyCalmMusicAudio = new Audio('./calmmusic.mp3');
    dailyCalmMusicAudio.loop = true;
    dailyCalmMusicAudio.load();
    
    // Event listeners
    document.getElementById('start-daily-session').addEventListener('click', startDailySession);
    document.getElementById('stop-daily-session').addEventListener('click', stopDailySession);
    document.getElementById('daily-music-toggle').addEventListener('click', toggleDailyMusic);
    document.getElementById('daily-vibration-toggle').addEventListener('click', toggleDailyVibration);
    document.getElementById('daily-session-form').addEventListener('submit', saveDailySession);
    document.getElementById('skip-daily-log').addEventListener('click', skipDailyLog);
    
    // Initialize toggle button states
    updateDailyMusicButton();
    updateDailyVibrationButton();
    
    // Set today's date in the form
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('daily-date').value = today;
}

function toggleDailyMusic() {
    dailyMusicEnabled = !dailyMusicEnabled;
    localStorage.setItem('dailyMusicEnabled', JSON.stringify(dailyMusicEnabled));
    updateDailyMusicButton();
    
    // If music is playing and user turns it off, stop it
    if (!dailyMusicEnabled && dailyCalmMusicAudio && !dailyCalmMusicAudio.paused) {
        dailyCalmMusicAudio.pause();
    }
    // If music should be playing and user turns it on, start it
    if (dailyMusicEnabled && dailySessionRunning) {
        dailyCalmMusicAudio.play().catch(err => console.log('Music play failed:', err));
    }
}

function updateDailyMusicButton() {
    const btn = document.getElementById('daily-music-toggle');
    if (btn) {
        btn.textContent = dailyMusicEnabled ? '🎵 Música: On' : '🔇 Música: Off';
        btn.classList.toggle('disabled', !dailyMusicEnabled);
    }
}

function toggleDailyVibration() {
    dailyVibrationEnabled = !dailyVibrationEnabled;
    localStorage.setItem('dailyVibrationEnabled', JSON.stringify(dailyVibrationEnabled));
    updateDailyVibrationButton();
    
    // Give haptic feedback when turning on
    if (dailyVibrationEnabled && 'vibrate' in navigator) {
        navigator.vibrate(100);
    }
}

function updateDailyVibrationButton() {
    const btn = document.getElementById('daily-vibration-toggle');
    if (btn) {
        btn.textContent = dailyVibrationEnabled ? '📳 Vibración: On' : '📴 Vibración: Off';
        btn.classList.toggle('disabled', !dailyVibrationEnabled);
    }
}

function triggerDailyVibration() {
    // Check if vibration is enabled and API is supported
    if (dailyVibrationEnabled && 'vibrate' in navigator) {
        // Vibrate pattern: vibrate 300ms, pause 100ms, vibrate 300ms, pause 100ms, vibrate 300ms
        navigator.vibrate([300, 100, 300, 100, 300]);
    }
}

function stopDailySession() {
    // Stop timer
    if (dailySessionInterval) {
        clearInterval(dailySessionInterval);
        dailySessionInterval = null;
    }
    
    // Stop phrase rotation
    stopPhraseRotation();
    
    // Stop all audio
    if (dailyChimeAudio) {
        dailyChimeAudio.pause();
        dailyChimeAudio.currentTime = 0;
    }
    if (dailyCalmMusicAudio) {
        dailyCalmMusicAudio.pause();
        dailyCalmMusicAudio.currentTime = 0;
        dailyCalmMusicAudio.volume = 1.0;
    }
    
    // Release wake lock
    releaseWakeLock();
    
    // Reset everything
    resetDailySession();
}

function startDailySession() {
    if (dailySessionRunning || dailyCountdownRunning) return;
    
    dailyCountdownRunning = true;
    dailyCountdownSeconds = 10;
    
    // Request wake lock
    requestWakeLock();
    
    // Unlock audio and play starting chime
    audioUnlocked = true;
    dailyChimeAudio.currentTime = 0;
    dailyChimeAudio.play().catch(err => console.log('Chime play failed:', err));
    
    // Update UI for countdown
    const startBtn = document.getElementById('start-daily-session');
    const stopBtn = document.getElementById('stop-daily-session');
    startBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
    
    document.getElementById('daily-timer-label').textContent = 'Ponte cómodo...';
    document.getElementById('daily-timer-display').textContent = '00:10';
    document.getElementById('daily-timer-display').classList.add('pre-countdown');
    document.getElementById('daily-glow-circle').classList.add('breathing');
    document.getElementById('daily-hint').textContent = 'Cierra los ojos y respira profundamente';
    
    // Start countdown
    dailySessionInterval = setInterval(updateCountdown, 1000);
}

function updateCountdown() {
    dailyCountdownSeconds--;
    
    // Update countdown display
    document.getElementById('daily-timer-display').textContent = 
        `00:${String(dailyCountdownSeconds).padStart(2, '0')}`;
    
    if (dailyCountdownSeconds <= 0) {
        // Countdown finished, start main session
        clearInterval(dailySessionInterval);
        dailyCountdownRunning = false;
        startMainMeditation();
    }
}

function startMainMeditation() {
    dailySessionRunning = true;
    dailySessionSeconds = dailySessionDuration;
    
    // Switch from pre-countdown to running class
    const dailyDisplay = document.getElementById('daily-timer-display');
    dailyDisplay.classList.remove('pre-countdown');
    dailyDisplay.classList.add('running');
    
    // Start looping calm music (if enabled)
    if (dailyMusicEnabled) {
        dailyCalmMusicAudio.currentTime = 0;
        dailyCalmMusicAudio.volume = 1.0;
        dailyCalmMusicAudio.play().catch(err => console.log('Music play failed:', err));
    }
    
    // Update UI
    // Start rotating meditation phrases
    currentPhraseIndex = 0;
    updateMeditationPhrase();
    startPhraseRotation();
    
    document.getElementById('daily-hint').textContent = 'Concéntrate en tu respiración';
    
    // Reset timer display and progress
    updateDailyTimerDisplay();
    document.getElementById('daily-progress-circle').style.strokeDashoffset = 0;
    
    // Start main timer
    dailySessionInterval = setInterval(updateDailyTimer, 1000);
}

function startPhraseRotation() {
    // Change phrase every 30 seconds
    dailyPhraseInterval = setInterval(() => {
        rotateMeditationPhrase();
    }, 30000);
}

function rotateMeditationPhrase() {
    const label = document.getElementById('daily-timer-label');
    
    // Fade out
    label.classList.add('fade-out');
    label.classList.remove('fade-in');
    
    // After fade out, change text and fade in
    setTimeout(() => {
        currentPhraseIndex = (currentPhraseIndex + 1) % meditationPhrases.length;
        label.textContent = meditationPhrases[currentPhraseIndex];
        label.classList.remove('fade-out');
        label.classList.add('fade-in');
    }, 500);
}

function updateMeditationPhrase() {
    const label = document.getElementById('daily-timer-label');
    label.textContent = meditationPhrases[currentPhraseIndex];
    label.classList.add('fade-in');
}

function stopPhraseRotation() {
    if (dailyPhraseInterval) {
        clearInterval(dailyPhraseInterval);
        dailyPhraseInterval = null;
    }
}

function updateDailyTimer() {
    if (dailySessionSeconds > 0) {
        dailySessionSeconds--;
        updateDailyTimerDisplay();
        updateDailyProgress();
    } else {
        // Timer reached 00:00, end the session
        completeDailySession();
    }
}

function updateDailyTimerDisplay() {
    const minutes = Math.floor(dailySessionSeconds / 60);
    const seconds = dailySessionSeconds % 60;
    document.getElementById('daily-timer-display').textContent = 
        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateDailyProgress() {
    const progress = (dailySessionDuration - dailySessionSeconds) / dailySessionDuration;
    const circumference = 2 * Math.PI * 85; // 534
    const offset = circumference * (1 - progress);
    document.getElementById('daily-progress-circle').style.strokeDashoffset = offset;
}

function fadeOutMusic(callback) {
    const fadeInterval = setInterval(() => {
        if (dailyCalmMusicAudio.volume > 0.05) {
            dailyCalmMusicAudio.volume -= 0.05;
        } else {
            dailyCalmMusicAudio.volume = 0;
            dailyCalmMusicAudio.pause();
            clearInterval(fadeInterval);
            if (callback) callback();
        }
    }, 200); // Fade over ~4 seconds
}

function completeDailySession() {
    // Stop timer
    if (dailySessionInterval) {
        clearInterval(dailySessionInterval);
        dailySessionInterval = null;
    }
    
    // Stop phrase rotation
    stopPhraseRotation();
    
    // Fade out music (if playing) and play completion chime
    if (dailyMusicEnabled && !dailyCalmMusicAudio.paused) {
        fadeOutMusic(() => {
            dailyChimeAudio.currentTime = 0;
            dailyChimeAudio.play().catch(err => console.log('Chime play failed:', err));
        });
    } else {
        // Just play the chime
        dailyChimeAudio.currentTime = 0;
        dailyChimeAudio.play().catch(err => console.log('Chime play failed:', err));
    }
    
    // Trigger vibration (using daily session's own setting)
    triggerDailyVibration();
    
    // Release wake lock
    releaseWakeLock();
    
    dailySessionRunning = false;
    
    // Switch to log mode
    document.getElementById('daily-session-mode').style.display = 'none';
    document.getElementById('daily-log-mode').style.display = 'flex';
    
    // Set today's date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('daily-date').value = today;
}

async function saveDailySession(e) {
    e.preventDefault();
    
    const session = {
        duration: 10, // Always 10 minutes
        date: document.getElementById('daily-date').value,
        location: document.getElementById('daily-location').value || '',
        notes: document.getElementById('daily-notes').value || ''
    };
    
    // Save the session using existing function
    if (useFirebase && currentUser) {
        await db.collection('users')
            .doc(currentUser.uid)
            .collection('sessions')
            .add(session);
    } else {
        session.id = Date.now().toString();
        meditationData.push(session);
        localStorage.setItem('meditationData', JSON.stringify(meditationData));
        updateDashboard();
        renderCalendar();
        updateHistory();
    }
    
    // Reset and go back to session mode
    resetDailySession();
    
    // Show confirmation and go to panel
    showToast('¡Sesión guardada exitosamente!');
    switchView('dashboard');
}

function skipDailyLog() {
    resetDailySession();
}

function resetDailySession() {
    // Stop any audio that might still be playing
    if (dailyCalmMusicAudio) {
        dailyCalmMusicAudio.pause();
        dailyCalmMusicAudio.volume = 1.0;
    }
    
    // Reset form
    document.getElementById('daily-location').value = '';
    document.getElementById('daily-notes').value = '';
    
    // Reset timer display
    dailySessionSeconds = dailySessionDuration;
    dailyCountdownSeconds = 10;
    dailySessionRunning = false;
    dailyCountdownRunning = false;
    updateDailyTimerDisplay();
    document.getElementById('daily-progress-circle').style.strokeDashoffset = 0;
    
    // Reset UI - show start button, hide stop button
    const startBtn = document.getElementById('start-daily-session');
    const stopBtn = document.getElementById('stop-daily-session');
    startBtn.style.display = 'inline-block';
    startBtn.disabled = false;
    stopBtn.style.display = 'none';
    
    document.getElementById('daily-timer-label').textContent = 'Sesión diaria de 10 minutos';
    document.getElementById('daily-timer-display').classList.remove('running');
    document.getElementById('daily-glow-circle').classList.remove('breathing');
    document.getElementById('daily-hint').textContent = 'Encuentra un lugar tranquilo y ponte cómodo';
    
    // Switch back to session mode
    document.getElementById('daily-log-mode').style.display = 'none';
    document.getElementById('daily-session-mode').style.display = 'flex';
}
