// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}

// Splash Screen Animation
window.addEventListener('load', () => {
    const splash = document.getElementById('splash-screen');
    if (splash) {
        setTimeout(() => {
            splash.classList.add('hidden');
            setTimeout(() => splash.remove(), 800); // Remove from DOM after transition
        }, 1500); // Display time before fading
    }
});

// State Management
let transactions = JSON.parse(localStorage.getItem('nabung_transactions')) || [];
let goals = JSON.parse(localStorage.getItem('nabung_goals')) || [];
let isLightMode = localStorage.getItem('nabung_theme') === 'light';

// Map Kategori ke Icon
const categoryMap = {
    'Makanan': '<i class="fa-solid fa-burger"></i>',
    'Transportasi': '<i class="fa-solid fa-car"></i>',
    'Belanja': '<i class="fa-solid fa-bag-shopping"></i>',
    'Tagihan': '<i class="fa-solid fa-file-invoice-dollar"></i>',
    'Hiburan': '<i class="fa-solid fa-gamepad"></i>',
    'Lainnya': '<i class="fa-solid fa-ellipsis"></i>'
};

const incomeCategoryMap = {
    'Gaji': '<i class="fa-solid fa-briefcase"></i>',
    'Freelance': '<i class="fa-solid fa-laptop-code"></i>',
    'Bonus': '<i class="fa-solid fa-gift"></i>',
    'Investasi': '<i class="fa-solid fa-chart-line"></i>',
    'Hadiah': '<i class="fa-solid fa-hand-holding-dollar"></i>',
    'Pendapatan': '<i class="fa-solid fa-coins"></i>',
    'Tabungan Berkala': '<i class="fa-solid fa-clock"></i>',
    'Lainnya': '<i class="fa-solid fa-ellipsis"></i>'
};

// DOM Elements
const totalBalanceEl = document.getElementById('total-balance');
const totalIncomeEl = document.getElementById('total-income');
const totalExpenseEl = document.getElementById('total-expense');
const goalsList = document.getElementById('goals-list');
const goalForm = document.getElementById('goal-form');
const addGoalBtn = document.getElementById('add-goal-btn');
const cancelGoalBtn = document.getElementById('cancel-goal-btn');
const recentTransactionList = document.getElementById('recent-transaction-list');
const desktopRecentTransactionList = document.getElementById('desktop-recent-transaction-list');
const fullTransactionList = document.getElementById('full-transaction-list');
const fabAdd = document.getElementById('fab-add');
const desktopAddBtn = document.getElementById('desktop-add-btn');
const transactionSheet = document.getElementById('transaction-sheet');
const sheetOverlay = document.getElementById('sheet-overlay');
const closeModalBtn = document.getElementById('close-modal-btn');
const transactionForm = document.getElementById('transaction-form');
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');
const viewAllBtn = document.getElementById('view-all-btn');
const desktopViewAllBtn = document.getElementById('desktop-view-all-btn');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const expenseChartCtx = document.getElementById('expenseChart')?.getContext('2d');
const aiMessageEl = document.getElementById('ai-message');

// Budget Elements
const budgetContainer = document.getElementById('budget-container');
const budgetText = document.getElementById('budget-text');
const budgetBar = document.getElementById('budget-bar');
const budgetInput = document.getElementById('budget-input');
let monthlyBudget = parseFloat(localStorage.getItem('nabung_budget')) || 0;

let expenseChartInstance = null;
let aiTypingTimeout = null;
let recurringSavings = JSON.parse(localStorage.getItem('nabung_recurring_savings')) || [];
let recurringTransactions = JSON.parse(localStorage.getItem('nabung_recurring_transactions')) || [];
let editingTransactionId = null;
let incomeCategories = JSON.parse(localStorage.getItem('nabung_income_categories')) || ['Gaji', 'Freelance', 'Bonus', 'Investasi', 'Hadiah', 'Lainnya'];
let wallets = JSON.parse(localStorage.getItem('nabung_wallets')) || [];
let notifSettings = JSON.parse(localStorage.getItem('nabung_notif')) || { budgetWarning: true, dailyReminder: false, goalReminder: true };
let actionHistory = [];
let pendingReceiptData = null;
let currencyConfig = JSON.parse(localStorage.getItem('nabung_currency')) || { code: 'IDR', symbol: 'Rp', locale: 'id-ID' };
let autoBackupEnabled = localStorage.getItem('nabung_auto_backup') === 'true';

// Utilities
const formatRupiah = (number) => {
    const cur = currencyConfig;
    try {
        return new Intl.NumberFormat(cur.locale || 'id-ID', { style: 'currency', currency: cur.code || 'IDR', minimumFractionDigits: cur.code === 'JPY' ? 0 : 0 }).format(number);
    } catch(e) {
        return `${cur.symbol || 'Rp'} ${number.toLocaleString('id-ID')}`;
    }
};

const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' };
    return new Date(dateString).toLocaleDateString('id-ID', options);
};

const vibrate = (ms = 50) => {
    if (navigator.vibrate) navigator.vibrate(ms);
};

const animateValue = (obj, start, end, duration) => {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const currentVal = Math.floor(progress * (end - start) + start);
        obj.innerHTML = formatRupiah(currentVal);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerHTML = formatRupiah(end);
        }
    };
    window.requestAnimationFrame(step);
}

let prevBalance = 0; let prevIncome = 0; let prevExpense = 0;

// --- CORE FUNCTIONS ---

const initTheme = () => {
    if (isLightMode) {
        document.documentElement.classList.add('light-mode');
        if(themeToggleBtn) themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
    } else {
        document.documentElement.classList.remove('light-mode');
        if(themeToggleBtn) themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
    }
};

const toggleTheme = () => {
    vibrate(30);
    isLightMode = !isLightMode;
    localStorage.setItem('nabung_theme', isLightMode ? 'light' : 'dark');
    initTheme();
    updateChart(); // Redraw chart with new colors
};
if(themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);
initTheme();

const updateDashboard = () => {
    const income = transactions.filter(item => item.type === 'income').reduce((acc, item) => acc + item.amount, 0);
    const expense = transactions.filter(item => item.type === 'expense').reduce((acc, item) => acc + item.amount, 0);
    const balance = income - expense;

    animateValue(totalBalanceEl, prevBalance, balance, 800);
    animateValue(totalIncomeEl, prevIncome, income, 800);
    animateValue(totalExpenseEl, prevExpense, expense, 800);
    
    prevBalance = balance; prevIncome = income; prevExpense = expense;

    if(transGoalSelect) {
        transGoalSelect.innerHTML = '<option value="main">Dompet Utama</option>';
        goals.forEach(g => transGoalSelect.innerHTML += `<option value="${g.id}">${g.name}</option>`);
    }
    const walletSelect = document.getElementById('trans-wallet');
    if(walletSelect) {
        walletSelect.innerHTML = '<option value="">-- Pilih Wallet --</option>';
        wallets.forEach(w => walletSelect.innerHTML += `<option value="${w.id}">${w.name}</option>`);
    }
    renderIncomeCategories();
    
    // Budget Update
    if (budgetContainer) {
        if (monthlyBudget > 0) {
            budgetContainer.style.display = 'block';
            const currMonthExpense = transactions.filter(t => t.type === 'expense' && new Date(t.date).getMonth() === new Date().getMonth()).reduce((a,b)=>a+b.amount, 0);
            const budgetProgress = Math.min((currMonthExpense / monthlyBudget) * 100, 100);
            budgetText.innerText = formatRupiah(currMonthExpense) + ' / ' + formatRupiah(monthlyBudget);
            budgetBar.style.width = budgetProgress + '%';
            if (budgetProgress > 90) budgetBar.style.background = '#dc2626';
            else if (budgetProgress > 75) budgetBar.style.background = '#f59e0b';
            else budgetBar.style.background = '#10b981';
        } else {
            budgetContainer.style.display = 'none';
        }
    }

    renderGoals();
    updateChart();
    generateAIInsights(income, expense, balance);
};

const getGoalBalance = (goalId) => {
    const inc = transactions.filter(t => t.goalId == goalId && t.type === 'income').reduce((a, b) => a + b.amount, 0);
    const exp = transactions.filter(t => t.goalId == goalId && t.type === 'expense').reduce((a, b) => a + b.amount, 0);
    return inc - exp;
};

// --- AI ENGINE ---
const typeWriterEffect = (text, element, speed = 40) => {
    if(aiTypingTimeout) clearTimeout(aiTypingTimeout);
    element.innerHTML = '';
    let i = 0;
    const type = () => {
        if (i < text.length) {
            element.innerHTML += text.charAt(i);
            i++;
            aiTypingTimeout = setTimeout(type, speed);
        }
    };
    type();
};

const generateAIInsights = (income, expense, balance) => {
    if(!aiMessageEl) return;
    
    let insight = "";
    
    if (transactions.length === 0) {
        insight = "Halo! Saya AI Advisor Anda. Catat transaksi pertama Anda, dan saya akan mulai menganalisis kebiasaan finansial Anda secara otomatis.";
        typeWriterEffect(insight, aiMessageEl);
        return;
    }

    // 1. Analisis Tren & Budget (Bulan Ini)
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const currentDay = now.getDate();
    
    const currentMonthTxs = transactions.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const currentMonthExpense = currentMonthTxs.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
    const currentMonthIncome = currentMonthTxs.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);

    // Kategori terbesar bulan ini
    const catTotals = {};
    currentMonthTxs.forEach(t => { if(t.type === 'expense') catTotals[t.category] = (catTotals[t.category]||0) + t.amount; });
    let maxCat = ''; let maxCatAmount = 0;
    for(let c in catTotals) { if(catTotals[c] > maxCatAmount) { maxCatAmount = catTotals[c]; maxCat = c; } }

    // Burn rate (Pengeluaran rata-rata per hari sejauh ini)
    const dailyBurnRate = currentDay > 0 ? currentMonthExpense / currentDay : 0;
    const projectedExpense = dailyBurnRate * daysInMonth;

    // Array of possible insights to rotate
    let potentialInsights = [];

    // Rule 1: Budget Warning (Sangat Pintar)
    if (monthlyBudget > 0) {
        if (currentMonthExpense > monthlyBudget) {
            potentialInsights.push(`🚨 Gawat! Pengeluaran bulan ini (${formatRupiah(currentMonthExpense)}) sudah menembus batas budget Anda. Segera rem pengeluaran!`);
        } else if (projectedExpense > monthlyBudget) {
            const overBudget = projectedExpense - monthlyBudget;
            potentialInsights.push(`⚠️ Prediksi AI: Jika pola belanja Anda tetap ${formatRupiah(dailyBurnRate)}/hari, Anda akan melewati budget sebesar ${formatRupiah(overBudget)} di akhir bulan.`);
        } else if (currentMonthExpense > monthlyBudget * 0.8) {
            potentialInsights.push(`⚡ Hati-hati, Anda sudah menghabiskan 80% dari budget bulan ini. Ketatkan sabuk pengaman finansial Anda!`);
        }
    }

    // Rule 2: Kategori Dominan
    if (maxCatAmount > 0) {
        const catRatio = (maxCatAmount / currentMonthExpense) * 100;
        if (catRatio > 40) {
            potentialInsights.push(`💡 Insight: ${catRatio.toFixed(0)}% uang Anda lari ke kategori '${maxCat}' bulan ini. Coba evaluasi apakah pengeluaran ini benar-benar penting?`);
        }
    }

    // Rule 3: Perbandingan Pemasukan vs Pengeluaran
    if (currentMonthExpense > currentMonthIncome && currentMonthIncome > 0) {
        potentialInsights.push(`📉 Bulan ini Anda lebih besar pasak daripada tiang (Pengeluaran melebihi pemasukan). Waktunya berhemat!`);
    }

    // Rule 4: Target Tabungan (Gamifikasi)
    if (goals.length > 0 && balance > 0) {
        let closestGoal = null; let highestProgress = 0;
        goals.forEach(g => {
            const gBal = getGoalBalance(g.id);
            const progress = (gBal / g.amount) * 100;
            if (progress >= highestProgress && progress < 100) { highestProgress = progress; closestGoal = g; }
            else if (progress >= 100 && !closestGoal) { closestGoal = g; highestProgress = progress; } // If already 100
        });
        
        if (closestGoal) {
            if (highestProgress >= 100) {
                potentialInsights.push(`🎉 Selamat! Target '${closestGoal.name}' tercapai 100%! Hebat, disiplin Anda membuahkan hasil.`);
            } else if (highestProgress > 80) {
                potentialInsights.push(`🔥 Tinggal selangkah lagi! Target '${closestGoal.name}' sudah ${highestProgress.toFixed(0)}%. Gas terus menabungnya!`);
            } else if (highestProgress > 0) {
                potentialInsights.push(`🎯 Anda sedang on-track menuju '${closestGoal.name}'. Konsisten adalah kunci kesuksesan finansial!`);
            }
        }
    }

    // Rule 5: Kondisi Sehat
    if (currentMonthIncome > currentMonthExpense * 1.5 && currentMonthExpense > 0) {
        potentialInsights.push(`✨ Sangat baik! Pemasukan Anda jauh lebih besar dari pengeluaran. Sisa uangnya jangan lupa diinvestasikan ya.`);
    }

    if (potentialInsights.length === 0) {
        potentialInsights.push(`Keuangan Anda terpantau stabil. Lanjutkan kebiasaan baik mencatat setiap pengeluaran!`);
    }

    // Pilih insight yang paling relevan (kritis)
    insight = potentialInsights[0];

    typeWriterEffect(insight, aiMessageEl);
};

const updateChart = () => {
    if(!expenseChartCtx) return;
    
    // Calculate expenses by category
    const expensesByCategory = {};
    transactions.forEach(t => {
        if (t.type === 'expense') {
            const cat = t.category || 'Lainnya';
            expensesByCategory[cat] = (expensesByCategory[cat] || 0) + t.amount;
        }
    });

    const labels = Object.keys(expensesByCategory);
    const data = Object.values(expensesByCategory);

    const chartColors = isLightMode 
        ? ['#3b82f6', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#64748b']
        : ['#00f2fe', '#fb7185', '#22d3ee', '#f5576c', '#818cf8', '#a1a1aa'];

    if (expenseChartInstance) {
        expenseChartInstance.destroy();
    }

    if(data.length === 0) {
        // Empty state chart
        expenseChartInstance = new Chart(expenseChartCtx, {
            type: 'doughnut',
            data: { labels: ['Belum ada pengeluaran'], datasets: [{ data: [1], backgroundColor: [isLightMode ? '#e2e8f0' : '#1e293b'], borderWidth: 0 }] },
            options: { cutout: '75%', plugins: { legend: { display: false } } }
        });
        return;
    }

    expenseChartInstance = new Chart(expenseChartCtx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: chartColors,
                borderWidth: 2,
                borderColor: isLightMode ? '#ffffff' : '#050505',
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: isLightMode ? '#0f172a' : '#ffffff', font: { family: 'Outfit', size: 12 } }
                }
            }
        }
    });
};

const renderGoals = () => {
    goalsList.innerHTML = '';
    if (goals.length === 0) {
        goalsList.innerHTML = '<div class="empty-state" style="padding: 1rem;"><p>Belum ada target tabungan.</p></div>';
        return;
    }

    goals.forEach(goal => {
        const goalBalance = getGoalBalance(goal.id);
        const progress = Math.min((goalBalance / goal.amount) * 100, 100);
        const isComplete = progress >= 100;
        const goalDiv = document.createElement('div');
        goalDiv.classList.add('goal-item');
        goalDiv.innerHTML = `
            <h3>${goal.name}</h3>
            ${goal.deadline ? `<span class="goal-deadline"><i class="fa-solid fa-calendar-day"></i> Tenggat: ${new Date(goal.deadline).toLocaleDateString('id-ID', {day:'numeric', month:'long', year:'numeric'})}</span>` : ''}
            <button class="delete-goal-btn" onclick="removeGoal(${goal.id})"><i class="fa-solid fa-trash"></i></button>
            <div class="progress-container" style="margin-top: 0;">
                <div class="progress-labels">
                    <span>${formatRupiah(goalBalance)} / ${formatRupiah(goal.amount)}</span>
                    <span>${progress.toFixed(1)}%</span>
                </div>
                <div class="progress-bar-wrapper">
                    <div class="progress-bar" style="width: 0%; ${isComplete ? 'background: linear-gradient(90deg, #10b981, #059669); box-shadow: 0 0 15px rgba(16, 185, 129, 0.5);' : ''}"></div>
                </div>
            </div>
        `;
        goalsList.appendChild(goalDiv);
        setTimeout(() => {
            const bar = goalDiv.querySelector('.progress-bar');
            if(bar) bar.style.width = `${progress}%`;
        }, 100);
    });
};

const createTransactionDOM = (transaction) => {
    const li = document.createElement('li');
    li.classList.add('transaction-item', transaction.type);
    
    const sign = transaction.type === 'income' ? '+' : '-';
    const cat = transaction.category || 'Lainnya';
    const catMap = transaction.type === 'income' ? incomeCategoryMap : categoryMap;
    const iconHTML = catMap[cat] || catMap['Lainnya'];
    
    li.innerHTML = `
        <div class="trans-left-group">
            <div class="trans-cat-icon">${iconHTML}</div>
            <div class="trans-info">
                <span class="trans-desc">${transaction.text}</span>
                <span class="trans-date">${formatDate(transaction.date)}</span>
                ${transaction.receipt ? `<span class="receipt-indicator" style="color: #a855f7; font-size: 0.75rem; cursor: pointer; margin-top: 2px;"><i class="fa-solid fa-image"></i> Ada Struk</span>` : ''}
            </div>
        </div>
        <div style="display: flex; align-items: center;">
            <span class="trans-amount">${sign}${formatRupiah(transaction.amount)}</span>
            <button class="edit-btn" onclick="editTransaction(${transaction.id}, event)"><i class="fa-solid fa-pen"></i></button>
            <button class="delete-btn" onclick="removeTransaction(${transaction.id}, event)"><i class="fa-solid fa-trash"></i></button>
        </div>
    `;
    return li;
};

// --- RECURRING SAVINGS ---
const renderRecurringSavings = () => {
    const list = document.getElementById('recurring-savings-list');
    if (!list) return;
    list.innerHTML = '';
    if (recurringSavings.length === 0) {
        list.innerHTML = '<div class="empty-state" style="padding: 1rem;"><p>Belum ada tabungan berkala.</p></div>';
        return;
    }
    recurringSavings.forEach(rs => {
        const freqLabel = rs.frequency === 'daily' ? 'Harian' : rs.frequency === 'weekly' ? 'Mingguan' : 'Bulanan';
        const div = document.createElement('div');
        div.classList.add('recurring-item');
        div.innerHTML = `
            <div class="recurring-info">
                <h4>${rs.name}</h4>
                <span class="recurring-freq-badge">${freqLabel}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <span class="trans-amount income" style="font-size: 1rem;">+${formatRupiah(rs.amount)}</span>
                <button class="delete-btn" onclick="removeRecurringSavings(${rs.id})" style="opacity: 1; transform: none; margin-left: 0.5rem;"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        list.appendChild(div);
    });
};

const processRecurringSavings = () => {
    const today = new Date(); today.setHours(0,0,0,0);
    let changed = false;
    recurringSavings.forEach(rs => {
        if (!rs.active) return;
        let lastDate = rs.lastProcessed ? new Date(rs.lastProcessed) : new Date('2000-01-01');
        lastDate.setHours(0,0,0,0);
        let nextDate = new Date(lastDate);
        if (rs.frequency === 'daily') nextDate.setDate(nextDate.getDate() + 1);
        else if (rs.frequency === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
        else if (rs.frequency === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
        while (nextDate <= today) {
            transactions.push({ id: generateID(), text: rs.name + ' (Otomatis)', amount: rs.amount, type: 'income', category: 'Tabungan Berkala', goalId: rs.goalId, date: nextDate.toISOString() });
            lastDate = new Date(nextDate);
            if (rs.frequency === 'daily') nextDate.setDate(nextDate.getDate() + 1);
            else if (rs.frequency === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
            else if (rs.frequency === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
            changed = true;
        }
        rs.lastProcessed = lastDate.toISOString().split('T')[0];
    });
    if (changed) { updateLocalStorage(); localStorage.setItem('nabung_recurring_savings', JSON.stringify(recurringSavings)); }
};

window.removeRecurringSavings = (id) => { vibrate(50); recurringSavings = recurringSavings.filter(rs => rs.id !== id); localStorage.setItem('nabung_recurring_savings', JSON.stringify(recurringSavings)); renderRecurringSavings(); };

// --- RECURRING TRANSACTIONS ---
const renderRecurringTransactions = () => {
    const list = document.getElementById('recurring-transactions-list');
    if (!list) return;
    list.innerHTML = '';
    if (recurringTransactions.length === 0) {
        list.innerHTML = '<div class="empty-state" style="padding: 1rem;"><p>Belum ada transaksi berulang.</p></div>';
        return;
    }
    recurringTransactions.forEach(rt => {
        const freqLabel = rt.frequency === 'daily' ? 'Harian' : rt.frequency === 'weekly' ? 'Mingguan' : 'Bulanan';
        const sign = rt.type === 'income' ? '+' : '-';
        const div = document.createElement('div');
        div.classList.add('recurring-item');
        div.innerHTML = `
            <div class="recurring-info">
                <h4>${rt.text}</h4>
                <div style="display: flex; gap: 0.5rem; align-items: center; margin-top: 0.3rem;">
                    <span class="recurring-freq-badge">${freqLabel}</span>
                    <span class="recurring-type-badge ${rt.type}">${rt.type === 'income' ? 'Masuk' : 'Keluar'}</span>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <span class="trans-amount ${rt.type}" style="font-size: 1rem;">${sign}${formatRupiah(rt.amount)}</span>
                <button class="delete-btn" onclick="removeRecurringTransaction(${rt.id})" style="opacity: 1; transform: none;"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        list.appendChild(div);
    });
};

const processRecurringTransactions = () => {
    const today = new Date(); today.setHours(0,0,0,0);
    let changed = false;
    recurringTransactions.forEach(rt => {
        if (!rt.active) return;
        let lastDate = rt.lastProcessed ? new Date(rt.lastProcessed) : new Date('2000-01-01');
        lastDate.setHours(0,0,0,0);
        let nextDate = new Date(lastDate);
        if (rt.frequency === 'daily') nextDate.setDate(nextDate.getDate() + 1);
        else if (rt.frequency === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
        else if (rt.frequency === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
        while (nextDate <= today) {
            transactions.push({ id: generateID(), text: rt.text + ' (Otomatis)', amount: rt.amount, type: rt.type, category: rt.category || 'Lainnya', goalId: rt.goalId, date: nextDate.toISOString() });
            lastDate = new Date(nextDate);
            if (rt.frequency === 'daily') nextDate.setDate(nextDate.getDate() + 1);
            else if (rt.frequency === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
            else if (rt.frequency === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
            changed = true;
        }
        rt.lastProcessed = lastDate.toISOString().split('T')[0];
    });
    if (changed) { updateLocalStorage(); localStorage.setItem('nabung_recurring_transactions', JSON.stringify(recurringTransactions)); }
};

window.removeRecurringTransaction = (id) => { vibrate(50); recurringTransactions = recurringTransactions.filter(rt => rt.id !== id); localStorage.setItem('nabung_recurring_transactions', JSON.stringify(recurringTransactions)); renderRecurringTransactions(); };

// --- EDIT TRANSACTION ---
window.editTransaction = (id, event) => {
    event.stopPropagation(); vibrate(30);
    const transaction = transactions.find(t => t.id === id);
    if (!transaction) return;
    editingTransactionId = id;
    document.getElementById('trans-desc').value = transaction.text;
    document.getElementById('trans-amount').value = new Intl.NumberFormat('id-ID').format(transaction.amount);
    const typeRadio = document.querySelector(`input[name="trans-type"][value="${transaction.type}"]`);
    if (typeRadio) { typeRadio.checked = true; typeRadio.dispatchEvent(new Event('change')); }
    if (transaction.type === 'expense') {
        const catRadio = document.querySelector(`input[name="trans-category"][value="${transaction.category}"]`);
        if (catRadio) catRadio.checked = true;
    } else {
        const incCatRadio = document.querySelector(`input[name="trans-income-category"][value="${transaction.category}"]`);
        if (incCatRadio) incCatRadio.checked = true;
    }
    if (transGoalSelect) transGoalSelect.value = transaction.goalId || 'main';
    const walletSelect = document.getElementById('trans-wallet');
    if (walletSelect) walletSelect.value = transaction.walletId || '';
    const submitBtn = transactionForm.querySelector('button[type="submit"]');
    submitBtn.textContent = 'Update Transaksi';
    openSheet();
};

let init = () => {
    if(recentTransactionList) recentTransactionList.innerHTML = '';
    if(desktopRecentTransactionList) desktopRecentTransactionList.innerHTML = '';
    if(fullTransactionList) fullTransactionList.innerHTML = '';
    
    processRecurringSavings();
    processRecurringTransactions();
    
    if (transactions.length === 0) {
        const emptyHTML = '<div class="empty-state"><i class="fa-solid fa-receipt"></i><p>Belum ada transaksi</p></div>';
        if(recentTransactionList) recentTransactionList.innerHTML = emptyHTML;
        if(desktopRecentTransactionList) desktopRecentTransactionList.innerHTML = emptyHTML;
        if(fullTransactionList) fullTransactionList.innerHTML = emptyHTML;
    } else {
        const sortedTransactions = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
        sortedTransactions.forEach(t => { if(fullTransactionList) fullTransactionList.appendChild(createTransactionDOM(t)); });
        
        const recent = sortedTransactions.slice(0, 3);
        recent.forEach(t => { if(recentTransactionList) recentTransactionList.appendChild(createTransactionDOM(t)); });

        const desktopRecent = sortedTransactions.slice(0, 4);
        desktopRecent.forEach(t => { if(desktopRecentTransactionList) desktopRecentTransactionList.appendChild(createTransactionDOM(t)); });
    }
    renderRecurringSavings();
    renderRecurringTransactions();
    updateDashboard();
};

// --- EVENT LISTENERS ---

const switchTab = (targetId) => {
    vibrate(30);
    navItems.forEach(item => item.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    document.querySelectorAll(`.nav-item[data-target="${targetId}"]`).forEach(nav => nav.classList.add('active'));
    document.getElementById(targetId).classList.add('active');
};
navItems.forEach(item => item.addEventListener('click', () => switchTab(item.dataset.target)));
if(viewAllBtn) viewAllBtn.addEventListener('click', () => switchTab('tab-history'));
if(desktopViewAllBtn) desktopViewAllBtn.addEventListener('click', () => switchTab('tab-history'));

const formatInputCurrency = (e) => {
    let val = e.target.value.replace(/[^0-9]/g, '');
    if(val !== '') e.target.value = new Intl.NumberFormat('id-ID').format(val);
    else e.target.value = '';
};
const parseCurrency = (val) => parseInt(val.replace(/\./g, '')) || 0;

const amountInput = document.getElementById('trans-amount');
const goalAmountInput = document.getElementById('goal-amount-input');
if(amountInput) { amountInput.type = 'text'; amountInput.inputMode = 'numeric'; amountInput.addEventListener('input', formatInputCurrency); }
if(goalAmountInput) { goalAmountInput.type = 'text'; goalAmountInput.inputMode = 'numeric'; goalAmountInput.addEventListener('input', formatInputCurrency); }

const openSheet = () => { vibrate(50); transactionSheet.classList.add('open'); };
let closeSheet = () => {
    transactionSheet.classList.remove('open');
    editingTransactionId = null;
    const submitBtn = transactionForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Simpan Transaksi';
};
if(fabAdd) fabAdd.addEventListener('click', openSheet);
if(desktopAddBtn) desktopAddBtn.addEventListener('click', openSheet);
if(sheetOverlay) sheetOverlay.addEventListener('click', closeSheet);
if(closeModalBtn) closeModalBtn.addEventListener('click', closeSheet);
const transGoalSelect = document.getElementById('trans-goal');

document.querySelectorAll('.radio-label, .cat-label').forEach(label => label.addEventListener('click', () => vibrate(20)));

// Toggle category selector based on Income vs Expense
const typeRadios = document.querySelectorAll('input[name="trans-type"]');
const catGroup = document.querySelector('.category-group');
const incCatGroup = document.querySelector('.income-category-group');
const renderIncomeCategories = () => {
    const sel = document.getElementById('income-category-selector');
    if (!sel) return;
    sel.innerHTML = '';
    incomeCategories.forEach((cat, i) => {
        const icon = incomeCategoryMap[cat] || incomeCategoryMap['Lainnya'];
        sel.innerHTML += `<label class="cat-label"><input type="radio" name="trans-income-category" value="${cat}" ${i===0?'checked':''}><span class="cat-icon">${icon}</span><span class="cat-name">${cat}</span></label>`;
    });
};
typeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        if(e.target.value === 'income') {
            catGroup.classList.add('hidden');
            incCatGroup.classList.remove('hidden');
        } else {
            catGroup.classList.remove('hidden');
            incCatGroup.classList.add('hidden');
        }
    });
});
// Trigger change on load to set initial state
const checkedType = document.querySelector('input[name="trans-type"]:checked');
if(checkedType && checkedType.value === 'income') {
    if(catGroup) catGroup.classList.add('hidden');
    if(incCatGroup) incCatGroup.classList.remove('hidden');
}


if(addGoalBtn) {
    addGoalBtn.addEventListener('click', () => {
        vibrate(30);
        goalsList.classList.add('hidden');
        goalForm.classList.remove('hidden');
        document.getElementById('goal-name-input').value = '';
        document.getElementById('goal-amount-input').value = '';
    });
}
if(cancelGoalBtn) {
    cancelGoalBtn.addEventListener('click', () => {
        goalForm.classList.add('hidden');
        goalsList.classList.remove('hidden');
    });
}
if(goalForm) {
    goalForm.addEventListener('submit', (e) => {
        e.preventDefault();
        vibrate(50);
        const name = document.getElementById('goal-name-input').value;
        const amount = parseCurrency(document.getElementById('goal-amount-input').value);
        if (name.trim() === '' || amount <= 0) return;
        const deadline = document.getElementById('goal-deadline-input')?.value || null;
        goals.push({ id: generateID(), name, amount, deadline });
        localStorage.setItem('nabung_goals', JSON.stringify(goals));
        goalForm.classList.add('hidden');
        goalsList.classList.remove('hidden');
        updateDashboard();
    });
}

const generateID = () => Math.floor(Math.random() * 100000000);
window.removeTransaction = (id, event) => {
    event.stopPropagation(); vibrate(50);
    const removed = transactions.find(t => t.id === id);
    if (removed) { actionHistory.push({ type: 'delete-transaction', data: { ...removed } }); updateUndoBtn(); }
    transactions = transactions.filter(transaction => transaction.id !== id);
    updateLocalStorage(); init();
};
window.removeGoal = (id) => {
    vibrate(50);
    const removed = goals.find(g => g.id === id);
    if (removed) { actionHistory.push({ type: 'delete-goal', data: { ...removed } }); updateUndoBtn(); }
    goals = goals.filter(goal => goal.id !== id);
    localStorage.setItem('nabung_goals', JSON.stringify(goals));
    updateDashboard();
};
const updateLocalStorage = () => {
    localStorage.setItem('nabung_transactions', JSON.stringify(transactions));
    if (autoBackupEnabled) autoBackup();
};

// Migrate old goals
const oldGoal = JSON.parse(localStorage.getItem('nabung_goal'));
if (oldGoal && oldGoal.name && goals.length === 0) {
    goals.push({ id: generateID(), name: oldGoal.name, amount: oldGoal.amount });
    localStorage.setItem('nabung_goals', JSON.stringify(goals));
    localStorage.removeItem('nabung_goal');
}

// 3D Tilt
document.addEventListener("mousemove", (e) => {
    if(window.innerWidth > 768) {
        document.querySelectorAll('.glass-card').forEach(card => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left; const y = e.clientY - rect.top;
            if (x > -100 && x < rect.width + 100 && y > -100 && y < rect.height + 100) {
                const xPct = (x / rect.width - 0.5) * 2; const yPct = (y / rect.height - 0.5) * 2;
                card.style.transform = `perspective(1000px) rotateX(${-yPct * 2}deg) rotateY(${xPct * 2}deg) translateY(-5px)`;
            } else {
                card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)`;
            }
        });
    }
});

// --- CHATBOT ENGINE ---
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

const appendMessage = (text, isUser = false) => {
    const bubble = document.createElement('div');
    bubble.classList.add('chat-bubble');
    bubble.classList.add(isUser ? 'user-bubble' : 'ai-bubble');
    
    if (isUser) {
        bubble.innerText = text;
        chatMessages.appendChild(bubble);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } else {
        chatMessages.appendChild(bubble);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        // Typing effect for AI
        let i = 0;
        const speed = 30;
        const type = () => {
            if (i < text.length) {
                bubble.innerHTML += text.charAt(i);
                i++;
                chatMessages.scrollTop = chatMessages.scrollHeight;
                setTimeout(type, speed);
            }
        };
        type();
    }
};

const getAIResponse = (message) => {
    const msg = message.toLowerCase();
    
    const income = transactions.filter(item => item.type === 'income').reduce((acc, item) => acc + item.amount, 0);
    const expense = transactions.filter(item => item.type === 'expense').reduce((acc, item) => acc + item.amount, 0);
    const balance = income - expense;
    
    // --- 1. Small Talk & Greetings ---
    if (/(halo|hai|pagi|siang|sore|malam|bot|ai)/i.test(msg)) {
        const replies = [
            "Halo! Saya AI Advisor v2.0 Anda. Ada yang bisa saya bantu tentang keuangan hari ini?",
            "Hai! Senang bisa ngobrol dengan Anda. Mau cek saldo, prediksi, atau minta tips?",
            "Halo! Saya siap menganalisis dompet Anda. Apa yang ingin Anda ketahui?"
        ];
        return replies[Math.floor(Math.random() * replies.length)];
    }
    
    if (/(siapa kamu|nama kamu|kamu siapa)/i.test(msg)) {
        return "Saya adalah AI Advisor v2.0 yang ditanamkan khusus di aplikasi Nabung ini. Tugas saya adalah menjaga kesehatan finansial Anda!";
    }
    
    if (/(canda|lelucon|lucu|humor)/i.test(msg)) {
        const jokes = [
            "Kenapa dompet selalu sedih di akhir bulan? Karena dia selalu merasa 'kosong' di dalam. 😅",
            "Uang itu seperti mantan, gampang pergi tapi susah baliknya! 🏃💨",
            "Mimpi pengen jadi miliarder, tapi pas lihat keranjang Shopee... ah sudahlah. 😂"
        ];
        return jokes[Math.floor(Math.random() * jokes.length)];
    }

    // --- 2. Emotion / Sentiment Analysis ---
    if (/(sedih|pusing|stres|capek|bangkrut|miskin|bokek)/i.test(msg)) {
        return "Saya mengerti perasaan Anda. Masalah keuangan memang sering bikin pusing. Tapi jangan menyerah! Mari kita mulai dari langkah kecil: kurangi jajan minggu ini dan catat setiap pengeluaran. Anda pasti bisa melewati ini! 💪";
    }
    if (/(senang|bahagia|gajian|kaya|banyak uang)/i.test(msg)) {
        return "Wah, ikut senang mendengarnya! 🎉 Jangan lupa sisihkan minimal 20% dari uang Anda saat ini untuk ditabung ya, sebelum habis dipakai jajan!";
    }

    // --- 3. Balance & Basic Stats ---
    if (/(saldo|uang saya|sisa|berapa uang)/i.test(msg)) {
        if (balance < 0) return `Saldo Anda saat ini minus: ${formatRupiah(balance)}. Anda berhutang atau pengeluaran melebihi pemasukan! 🚨`;
        if (balance === 0) return "Saldo Anda Rp 0. Anda belum punya uang atau uang Anda sudah habis total. Ayo semangat cari pemasukan!";
        return `Sisa saldo Anda saat ini adalah ${formatRupiah(balance)}. ${balance < 50000 ? 'Wah, saldo menipis nih. Yuk hemat!' : 'Masih cukup aman untuk kebutuhan sehari-hari!'}`;
    }
    
    if (/(pemasukan|gaji|dapat uang)/i.test(msg)) {
        return `Total pemasukan Anda sejauh ini adalah ${formatRupiah(income)}. ${income === 0 ? 'Belum ada pemasukan yang dicatat.' : 'Terus tingkatkan semangat kerja Anda!'}`;
    }

    // --- 4. Deep Category Analysis ---
    if (/(pengeluaran|boros|habis|belanja)/i.test(msg)) {
        if (expense === 0) return "Anda belum mencatat pengeluaran sama sekali. Sangat hemat!";
        const catTotals = {};
        transactions.forEach(t => { if(t.type === 'expense') catTotals[t.category] = (catTotals[t.category]||0) + t.amount; });
        
        let maxCat = ''; let maxCatAmount = 0;
        for(let c in catTotals) { if(catTotals[c] > maxCatAmount) { maxCatAmount = catTotals[c]; maxCat = c; } }
        
        // Regex check if user asks for specific category (e.g. "makanan", "hiburan")
        const specificCatMatch = msg.match(/(makanan|transport|belanja|tagihan|hiburan)/i);
        if (specificCatMatch) {
            let catName = specificCatMatch[1];
            // Normalize names
            if (catName === 'transport') catName = 'Transportasi';
            const specificTotal = catTotals[catName] || 0;
            return `Total pengeluaran Anda untuk kategori '${catName}' adalah ${formatRupiah(specificTotal)}.`;
        }
        
        return `Total pengeluaran Anda: ${formatRupiah(expense)}. Pengeluaran terbesar Anda ada di kategori '${maxCat}' sebesar ${formatRupiah(maxCatAmount)}. Coba kurangi jajan di area ini ya!`;
    }

    // --- 5. Goal Analysis ---
    if (/(target|tujuan|impian)/i.test(msg)) {
        if(goals.length === 0) return "Anda belum mengatur target tabungan. Yuk buat target baru di halaman Beranda!";
        let g = goals[0]; // Analyze the first goal
        let gBal = getGoalBalance(g.id);
        let prog = Math.min((gBal / g.amount) * 100, 100);
        if (prog >= 100) return `Target '${g.name}' (${formatRupiah(g.amount)}) SUDAH TERCAPAI! 🎉 Selamat! Anda sudah bisa mewujudkannya!`;
        let remaining = g.amount - gBal;
        return `Untuk target '${g.name}', dompet tersebut sudah mengumpulkan ${formatRupiah(gBal)} dari ${formatRupiah(g.amount)}. Kurang ${formatRupiah(remaining)} lagi (${prog.toFixed(1)}%). Semangat!`;
    }

    // --- 6. Prediction Engine ---
    if (/(kapan habis|prediksi|bertahan berapa|hari lagi)/i.test(msg)) {
        if (expense === 0) return "Karena Anda belum punya pengeluaran, saldo Anda akan bertahan selamanya! (Secara teori 😅)";
        if (balance <= 0) return "Saldo Anda sudah habis, tidak ada yang bisa diprediksi lagi 😭.";
        
        // Sangat sederhana: hitung rata-rata pengeluaran per transaksi
        const expenseTransactions = transactions.filter(t => t.type === 'expense');
        const avgExpense = expense / expenseTransactions.length;
        
        // Asumsikan user melakukan 1 transaksi pengeluaran per hari (penyederhanaan)
        const daysLeft = Math.floor(balance / avgExpense);
        
        if (daysLeft > 30) {
            return `Berdasarkan rata-rata pengeluaran Anda (${formatRupiah(avgExpense)}/transaksi), saldo Anda diprediksi aman untuk lebih dari 1 bulan ke depan. 👍`;
        } else if (daysLeft > 0) {
            return `⚠️ Prediksi AI: Berdasarkan rata-rata gaya belanja Anda (${formatRupiah(avgExpense)}), saldo Anda diprediksi akan habis dalam **${daysLeft} hari** lagi! Hati-hati!`;
        } else {
            return `Gawat! Gaya belanja Anda terlalu besar. Saldo Anda diprediksi akan habis hari ini juga jika Anda tidak ngerem!`;
        }
    }

    // --- 7. Tips ---
    if (/(tips|saran|hemat)/i.test(msg)) {
        const tips = [
            "Tips AI: Bawa bekal makanan dari rumah bisa menghemat hingga 40% pengeluaran bulanan Anda loh!",
            "Aturan 50/30/20: 50% untuk kebutuhan pokok, 30% untuk hiburan/keinginan, dan wajib 20% untuk ditabung.",
            "Tips: Hapus aplikasi belanja online dari layar utama HP Anda untuk mengurangi hasrat *impulse buying*.",
            "Tips: Sebelum membeli barang mahal, tunggu 24 jam. Jika besoknya masih merasa butuh, baru beli."
        ];
        return tips[Math.floor(Math.random() * tips.length)];
    }
    
    // --- Fallback ---
    return "Hmm, saya belum mengerti maksud Anda. Coba tanya tentang 'prediksi uang habis', 'analisis kategori pengeluaran', 'target tabungan', atau ketik 'saya pusing' kalau butuh teman curhat!";
};

if(chatForm) {
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const msg = chatInput.value.trim();
        if(!msg) return;
        
        appendMessage(msg, true);
        chatInput.value = '';
        
        // Emulate thinking
        setTimeout(() => {
            const reply = getAIResponse(msg);
            appendMessage(reply, false);
        }, 500);
    });
}

// Initialize App
// --- GOOGLE DRIVE SYNC ---
const CLIENT_ID = '1001668189929-0p72vp623i632betu2djk06in4srek6a.apps.googleusercontent.com';
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = "https://www.googleapis.com/auth/drive.appdata";

let tokenClient;
let gapiInited = false;
let gisInited = false;

const driveLoginBtn = document.getElementById('drive-login-btn');
const driveLogoutBtn = document.getElementById('drive-logout-btn');
const driveSyncStatus = document.getElementById('drive-sync-status');

function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    await gapi.client.init({
        discoveryDocs: DISCOVERY_DOCS,
    });
    gapiInited = true;
    maybeEnableButtons();
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response) => {
            if (response.error !== undefined) {
                throw (response);
            }
            driveSyncStatus.innerText = "Terhubung. Sedang menyinkronkan...";
            driveLoginBtn.style.display = 'none';
            driveLogoutBtn.style.display = 'block';
            downloadFromDrive(); // sync on login
        },
    });
    gisInited = true;
    maybeEnableButtons();
}

function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        if(driveLoginBtn) driveLoginBtn.disabled = false;
    }
}

if(driveLoginBtn) {
    driveLoginBtn.addEventListener('click', () => {
        if(CLIENT_ID === 'ISI_CLIENT_ID_ANDA_DISINI') {
            alert('Client ID Google belum diisi! Silakan ikuti panduan untuk mendapatkan Client ID terlebih dahulu.');
            return;
        }
        if (gapi.client.getToken() === null) {
            tokenClient.requestAccessToken({prompt: 'consent'});
        } else {
            tokenClient.requestAccessToken({prompt: ''});
        }
    });
}

if(driveLogoutBtn) {
    driveLogoutBtn.addEventListener('click', () => {
        const token = gapi.client.getToken();
        if (token !== null) {
            google.accounts.oauth2.revoke(token.access_token, () => {
                gapi.client.setToken('');
                driveSyncStatus.innerText = "Belum terhubung ke Google Drive.";
                driveLoginBtn.style.display = 'block';
                driveLogoutBtn.style.display = 'none';
            });
        }
    });
}

async function getBackupFileId() {
    try {
        const response = await gapi.client.drive.files.list({
            spaces: 'appDataFolder',
            fields: 'nextPageToken, files(id, name)',
            pageSize: 10
        });
        const files = response.result.files;
        const backupFile = files.find(f => f.name === 'nabung_backup.json');
        return backupFile ? backupFile.id : null;
    } catch (err) {
        console.error('Error finding backup file', err);
        return null;
    }
}

async function uploadToDrive() {
    if(!gapiInited || gapi.client.getToken() === null) return; // Not logged in
    
    driveSyncStatus.innerText = "Menyimpan ke Cloud...";
    
    const dataToBackup = {
        transactions,
        goals,
        monthlyBudget,
        recurringSavings,
        recurringTransactions,
        incomeCategories,
        wallets,
        notifSettings,
        groups,
        currencyConfig
    };
    
    const fileContent = JSON.stringify(dataToBackup);
    const file = new Blob([fileContent], {type: 'application/json'});
    const metadata = {
        name: 'nabung_backup.json',
        parents: ['appDataFolder']
    };

    const fileId = await getBackupFileId();
    
    const accessToken = gapi.client.getToken().access_token;
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], {type: 'application/json'}));
    form.append('file', file);

    const url = fileId 
        ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
        : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
        
    const method = fileId ? 'PATCH' : 'POST';

    try {
        const res = await fetch(url, {
            method: method,
            headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
            body: form
        });
        if(res.ok) {
            const date = new Date().toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'});
            driveSyncStatus.innerText = `Terhubung (Disinkronkan: ${date})`;
        } else {
            driveSyncStatus.innerText = "Gagal menyinkronkan.";
        }
    } catch(err) {
        console.error('Error uploading:', err);
        driveSyncStatus.innerText = "Gagal menyinkronkan.";
    }
}

async function downloadFromDrive() {
    if(!gapiInited || gapi.client.getToken() === null) return;
    
    try {
        driveSyncStatus.innerText = "Memuat data dari Cloud...";
        const fileId = await getBackupFileId();
        if(!fileId) {
            uploadToDrive();
            return;
        }
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media'
        });
        
        const data = response.result;
        if(data && typeof data === 'object') {
            if(data.transactions) { localStorage.setItem('nabung_transactions', JSON.stringify(data.transactions)); transactions = data.transactions; }
            if(data.goals) { localStorage.setItem('nabung_goals', JSON.stringify(data.goals)); goals = data.goals; }
            if(data.monthlyBudget !== undefined) { localStorage.setItem('nabung_budget', data.monthlyBudget); monthlyBudget = data.monthlyBudget; }
            if(data.recurringSavings) { localStorage.setItem('nabung_recurring_savings', JSON.stringify(data.recurringSavings)); recurringSavings = data.recurringSavings; }
            if(data.recurringTransactions) { localStorage.setItem('nabung_recurring_transactions', JSON.stringify(data.recurringTransactions)); recurringTransactions = data.recurringTransactions; }
            if(data.incomeCategories) { localStorage.setItem('nabung_income_categories', JSON.stringify(data.incomeCategories)); incomeCategories = data.incomeCategories; }
            if(data.wallets) { localStorage.setItem('nabung_wallets', JSON.stringify(data.wallets)); wallets = data.wallets; }
            if(data.notifSettings) { localStorage.setItem('nabung_notif', JSON.stringify(data.notifSettings)); notifSettings = data.notifSettings; }
            if(data.groups) { localStorage.setItem('nabung_groups', JSON.stringify(data.groups)); groups = data.groups; }
            if(data.currencyConfig) { localStorage.setItem('nabung_currency', JSON.stringify(data.currencyConfig)); currencyConfig = data.currencyConfig; }
            
            init(); // Re-render UI
            
            const date = new Date().toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'});
            driveSyncStatus.innerText = `Terhubung (Disinkronkan: ${date})`;
            alert('Data berhasil dipulihkan dari Google Drive!');
        }
    } catch(err) {
        console.error('Error downloading:', err);
        driveSyncStatus.innerText = "Gagal memuat data dari Cloud.";
    }
}

// Trigger upload on local data change
const originalUpdateLocalStorage = window.updateLocalStorage || function(){};
window.updateLocalStorage = function() {
    originalUpdateLocalStorage();
    uploadToDrive();
};

let apiLoadCheckInterval = setInterval(() => {
    if(typeof gapi !== 'undefined' && !gapiInited) {
        gapiLoaded();
    }
    if(typeof google !== 'undefined' && typeof google.accounts !== 'undefined' && !gisInited) {
        gisLoaded();
    }
    if(gapiInited && gisInited) {
        clearInterval(apiLoadCheckInterval);
    }
}, 500);// --- SECURITY & SETTINGS ---
let appPin = localStorage.getItem('nabung_pin');
let currentPinInput = '';
let isSettingPin = false;
let confirmPinStr = '';
const lockScreen = document.getElementById('lock-screen');
const pinDots = document.querySelectorAll('.pin-dot');
const pinMessage = document.getElementById('pin-message');
const lockTitle = document.getElementById('lock-title');

if (appPin && appPin.length !== 6) {
    localStorage.removeItem('nabung_pin');
    appPin = null;
    alert('Sistem Keamanan diperbarui ke 6-digit. PIN lama Anda telah direset demi keamanan. Silakan atur ulang PIN di menu Pengaturan.');
}

if (appPin) { lockScreen.classList.remove('hidden'); }

const updatePinDots = () => { pinDots.forEach((dot, i) => { if (i < currentPinInput.length) dot.classList.add('filled'); else dot.classList.remove('filled'); }); };

window.addPin = (num) => { if (currentPinInput.length < 6) { currentPinInput += num; updatePinDots(); vibrate(30); if (currentPinInput.length === 6) { setTimeout(processPin, 300); } } };
window.removePin = () => { if (currentPinInput.length > 0) { currentPinInput = currentPinInput.slice(0, -1); updatePinDots(); vibrate(30); } };
window.clearPin = () => { currentPinInput = ''; updatePinDots(); vibrate(30); };

window.closePinModal = () => {
    if (isSettingPin) {
        lockScreen.classList.add('hidden');
        isSettingPin = false;
        currentPinInput = '';
        confirmPinStr = '';
        updatePinDots();
    } else if (!appPin) {
        lockScreen.classList.add('hidden');
        currentPinInput = '';
        updatePinDots();
    }
};

const processPin = () => { if (isSettingPin) { if (confirmPinStr === '') { confirmPinStr = currentPinInput; currentPinInput = ''; updatePinDots(); lockTitle.innerText = 'Konfirmasi PIN'; pinMessage.innerText = ''; pinMessage.style.color = 'var(--text-main)'; } else { if (currentPinInput === confirmPinStr) { localStorage.setItem('nabung_pin', currentPinInput); appPin = currentPinInput; lockScreen.classList.add('hidden'); alert('PIN Berhasil Diatur!'); isSettingPin = false; } else { pinMessage.innerText = 'PIN tidak cocok. Coba lagi.'; pinMessage.style.color = 'var(--expense)'; currentPinInput = ''; confirmPinStr = ''; lockTitle.innerText = 'Masukkan PIN Baru'; updatePinDots(); } } } else { if (currentPinInput === appPin) { lockScreen.classList.add('hidden'); currentPinInput = ''; updatePinDots(); } else { pinMessage.innerText = 'PIN Salah!'; currentPinInput = ''; updatePinDots(); } } };

const settingsSheet = document.getElementById('settings-sheet');
const settingsOverlay = document.getElementById('settings-overlay');
const openSettingsBtn = document.getElementById('settings-toggle-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');

const openSettings = () => { settingsSheet.classList.add('open'); vibrate(50); };
const closeSettings = () => { settingsSheet.classList.remove('open'); vibrate(50); };
if(openSettingsBtn) openSettingsBtn.addEventListener('click', openSettings);
if(closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettings);
if(settingsOverlay) settingsOverlay.addEventListener('click', closeSettings);

document.getElementById('setup-pin-btn')?.addEventListener('click', () => { if (appPin) { if(confirm('Hapus PIN Keamanan saat ini?')) { localStorage.removeItem('nabung_pin'); appPin = null; alert('PIN Dihapus'); } } else { closeSettings(); isSettingPin = true; confirmPinStr = ''; currentPinInput = ''; updatePinDots(); lockTitle.innerText = 'Masukkan PIN Baru'; lockScreen.classList.remove('hidden'); pinMessage.innerText = ''; } });

// Backup & Restore
document.getElementById('export-btn')?.addEventListener('click', () => { const data = { transactions, goals, theme: localStorage.getItem('nabung_theme'), pin: appPin }; const blob = new Blob([JSON.stringify(data)], {type: 'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'Nabung_Backup.json'; a.click(); });

document.getElementById('import-btn-trigger')?.addEventListener('click', () => document.getElementById('import-file').click());
document.getElementById('import-file')?.addEventListener('change', (e) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (ev) => { try { const data = JSON.parse(ev.target.result); if(data.transactions) { transactions = data.transactions; updateLocalStorage(); } if(data.goals) { goals = data.goals; localStorage.setItem('nabung_goals', JSON.stringify(goals)); } if(data.pin) localStorage.setItem('nabung_pin', data.pin); alert('Data berhasil dipulihkan! Halaman akan direfresh.'); location.reload(); } catch(err) { alert('File backup tidak valid!'); } }; reader.readAsText(file); });


// --- CALENDAR SYSTEM ---
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
const calendarBody = document.getElementById('calendar-body');
const calendarTitle = document.getElementById('calendar-month-year');
const prevMonthBtn = document.getElementById('prev-month-btn');
const nextMonthBtn = document.getElementById('next-month-btn');
const calendarDayDetails = document.getElementById('calendar-day-details');
const selectedDateTitle = document.getElementById('selected-date-title');
const selectedDateTransactions = document.getElementById('selected-date-transactions');

const renderCalendar = () => {
    if(!calendarBody) return;
    calendarBody.innerHTML = '';
    const date = new Date(currentYear, currentMonth, 1);
    const monthName = date.toLocaleString('id-ID', { month: 'long' });
    calendarTitle.innerText = monthName + ' ' + currentYear;
    const firstDayIndex = date.getDay();
    const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
    let tr = document.createElement('tr');
    for (let i = 0; i < firstDayIndex; i++) {
        const td = document.createElement('td');
        td.classList.add('empty-cell');
        tr.appendChild(td);
    }
    let dayCount = 1;
    while (dayCount <= lastDay) {
        if (tr.children.length === 7) {
            calendarBody.appendChild(tr);
            tr = document.createElement('tr');
        }
        const td = document.createElement('td');
        td.innerHTML = '<span class="day-num">' + dayCount + '</span>';
        const currentIterDate = new Date(currentYear, currentMonth, dayCount);
        
        // Handle timezone offset to ensure the date string is correct locally
        const localOffset = currentIterDate.getTimezoneOffset() * 60000;
        const localTime = new Date(currentIterDate.getTime() - localOffset);
        const iterDateString = localTime.toISOString().split('T')[0];
        
        const dayTrans = transactions.filter(t => t.date && t.date.startsWith(iterDateString));
        if (dayTrans.length > 0) {
            const dotsDiv = document.createElement('div');
            dotsDiv.classList.add('day-dots');
            let hasIncome = false;
            let hasExpense = false;
            dayTrans.forEach(t => {
                if(t.type === 'income') hasIncome = true;
                if(t.type === 'expense') hasExpense = true;
            });
            if (hasIncome) dotsDiv.innerHTML += '<div class="dot income"></div>';
            if (hasExpense) dotsDiv.innerHTML += '<div class="dot expense"></div>';
            td.appendChild(dotsDiv);
        }
        td.dataset.date = iterDateString;
        td.addEventListener('click', () => showDayDetails(iterDateString, dayTrans, td));
        tr.appendChild(td);
        dayCount++;
    }
    if (tr.children.length > 0) {
        while(tr.children.length < 7) {
            const td = document.createElement('td');
            td.classList.add('empty-cell');
            tr.appendChild(td);
        }
        calendarBody.appendChild(tr);
    }
};

const showDayDetails = (dateStr, dayTrans, cellEl) => {
    document.querySelectorAll('.calendar-grid td').forEach(td => td.classList.remove('active-day'));
    cellEl.classList.add('active-day');
    selectedDateTitle.innerText = 'Transaksi Tanggal ' + new Date(dateStr).toLocaleString('id-ID', {day:'numeric', month:'long', year:'numeric'});
    selectedDateTransactions.innerHTML = '';
    if (dayTrans.length === 0) {
        selectedDateTransactions.innerHTML = '<div class="empty-state">Tidak ada transaksi.</div>';
    } else {
        dayTrans.forEach(t => selectedDateTransactions.appendChild(createTransactionDOM(t)));
    }
    calendarDayDetails.style.display = 'block';
    vibrate(30);
};

if(prevMonthBtn) prevMonthBtn.addEventListener('click', () => { currentMonth--; if(currentMonth < 0) { currentMonth = 11; currentYear--; } renderCalendar(); vibrate(30); });
if(nextMonthBtn) nextMonthBtn.addEventListener('click', () => { currentMonth++; if(currentMonth > 11) { currentMonth = 0; currentYear++; } renderCalendar(); vibrate(30); });

// Override init to include calendar
const _oldInit = init;
init = () => { _oldInit(); renderCalendar(); };
init();


// --- BUDGETING SYSTEM ---

if (budgetInput && monthlyBudget > 0) budgetInput.value = monthlyBudget;

window.saveBudget = () => { if(budgetInput) { const val = parseFloat(budgetInput.value); if(val >= 0) { monthlyBudget = val; localStorage.setItem('nabung_budget', monthlyBudget); alert('Budget Bulanan Disimpan!'); updateDashboard(); } } };

// --- RECURRING SAVINGS EVENT LISTENERS ---
const recurringSavingsForm = document.getElementById('recurring-savings-form');
const addRecurringSavingsBtn = document.getElementById('add-recurring-savings-btn');
const cancelRecurringSavingsBtn = document.getElementById('cancel-recurring-savings-btn');

if (addRecurringSavingsBtn) {
    addRecurringSavingsBtn.addEventListener('click', () => {
        vibrate(30);
        document.getElementById('recurring-savings-list').classList.add('hidden');
        recurringSavingsForm.classList.remove('hidden');
        document.getElementById('rs-name-input').value = '';
        document.getElementById('rs-amount-input').value = '';
        const rsGoalSelect = document.getElementById('rs-goal-id');
        rsGoalSelect.innerHTML = '<option value="main">Dompet Utama</option>';
        goals.forEach(g => rsGoalSelect.innerHTML += `<option value="${g.id}">${g.name}</option>`);
    });
}
if (cancelRecurringSavingsBtn) {
    cancelRecurringSavingsBtn.addEventListener('click', () => {
        recurringSavingsForm.classList.add('hidden');
        document.getElementById('recurring-savings-list').classList.remove('hidden');
    });
}
if (recurringSavingsForm) {
    recurringSavingsForm.addEventListener('submit', (e) => {
        e.preventDefault(); vibrate(50);
        const name = document.getElementById('rs-name-input').value;
        const amount = parseCurrency(document.getElementById('rs-amount-input').value);
        const frequency = document.getElementById('rs-frequency').value;
        const goalId = document.getElementById('rs-goal-id').value;
        if (name.trim() === '' || amount <= 0) return;
        recurringSavings.push({ id: generateID(), name, amount, frequency, goalId, active: true, lastProcessed: new Date().toISOString().split('T')[0] });
        localStorage.setItem('nabung_recurring_savings', JSON.stringify(recurringSavings));
        recurringSavingsForm.classList.add('hidden');
        document.getElementById('recurring-savings-list').classList.remove('hidden');
        renderRecurringSavings();
    });
}

// --- RECURRING TRANSACTION EVENT LISTENERS ---
const recurringTransactionForm = document.getElementById('recurring-transaction-form');
const addRecurringTransactionBtn = document.getElementById('add-recurring-transaction-btn');
const cancelRecurringTransactionBtn = document.getElementById('cancel-recurring-transaction-btn');
const recurringCatGroup = document.querySelector('.recurring-category-group');

if (addRecurringTransactionBtn) {
    addRecurringTransactionBtn.addEventListener('click', () => {
        vibrate(30);
        document.getElementById('recurring-transactions-list').classList.add('hidden');
        recurringTransactionForm.classList.remove('hidden');
        document.getElementById('rt-desc-input').value = '';
        document.getElementById('rt-amount-input').value = '';
        const rtGoalSelect = document.getElementById('rt-goal-id');
        rtGoalSelect.innerHTML = '<option value="main">Dompet Utama</option>';
        goals.forEach(g => rtGoalSelect.innerHTML += `<option value="${g.id}">${g.name}</option>`);
    });
}
if (cancelRecurringTransactionBtn) {
    cancelRecurringTransactionBtn.addEventListener('click', () => {
        recurringTransactionForm.classList.add('hidden');
        document.getElementById('recurring-transactions-list').classList.remove('hidden');
    });
}

const recurringTypeRadios = document.querySelectorAll('input[name="recurring-type"]');
recurringTypeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        if (e.target.value === 'income') { if(recurringCatGroup) recurringCatGroup.classList.add('hidden'); }
        else { if(recurringCatGroup) recurringCatGroup.classList.remove('hidden'); }
    });
});
const checkedRecurringType = document.querySelector('input[name="recurring-type"]:checked');
if (checkedRecurringType && checkedRecurringType.value === 'income') { if (recurringCatGroup) recurringCatGroup.classList.add('hidden'); }

if (recurringTransactionForm) {
    recurringTransactionForm.addEventListener('submit', (e) => {
        e.preventDefault(); vibrate(50);
        const text = document.getElementById('rt-desc-input').value;
        const amount = parseCurrency(document.getElementById('rt-amount-input').value);
        const type = document.querySelector('input[name="recurring-type"]:checked').value;
        const frequency = document.getElementById('rt-frequency').value;
        const goalId = document.getElementById('rt-goal-id').value;
        let category = 'Lainnya';
        if (type === 'expense') { const catRadio = document.querySelector('input[name="recurring-category"]:checked'); if (catRadio) category = catRadio.value; }
        else { category = 'Pendapatan'; }
        if (text.trim() === '' || amount <= 0) return;
        recurringTransactions.push({ id: generateID(), text, amount, type, category, goalId, frequency, active: true, lastProcessed: new Date().toISOString().split('T')[0] });
        localStorage.setItem('nabung_recurring_transactions', JSON.stringify(recurringTransactions));
        recurringTransactionForm.classList.add('hidden');
        document.getElementById('recurring-transactions-list').classList.remove('hidden');
        renderRecurringTransactions();
    });
}

const rsAmountInput = document.getElementById('rs-amount-input');
const rtAmountInput = document.getElementById('rt-amount-input');
if (rsAmountInput) { rsAmountInput.type = 'text'; rsAmountInput.inputMode = 'numeric'; rsAmountInput.addEventListener('input', formatInputCurrency); }
if (rtAmountInput) { rtAmountInput.type = 'text'; rtAmountInput.inputMode = 'numeric'; rtAmountInput.addEventListener('input', formatInputCurrency); }

// --- FILTER & SEARCH ---
const filterSearch = document.getElementById('filter-search');
const filterCategory = document.getElementById('filter-category');
const filterDateStart = document.getElementById('filter-date-start');
const filterDateEnd = document.getElementById('filter-date-end');
const filterAmountMin = document.getElementById('filter-amount-min');
const filterAmountMax = document.getElementById('filter-amount-max');
const filterApplyBtn = document.getElementById('filter-apply-btn');
const filterResetBtn = document.getElementById('filter-reset-btn');
const toggleFilterBtn = document.getElementById('toggle-filter-btn');
const filterBar = document.getElementById('filter-bar');
let activeFilter = null;

const populateFilterCategories = () => {
    if (!filterCategory) return;
    const cats = new Set();
    transactions.forEach(t => cats.add(t.category));
    filterCategory.innerHTML = '<option value="">Semua Kategori</option>';
    [...cats].sort().forEach(c => { filterCategory.innerHTML += `<option value="${c}">${c}</option>`; });
};

const applyFilter = () => {
    const search = filterSearch?.value.toLowerCase() || '';
    const cat = filterCategory?.value || '';
    const dateStart = filterDateStart?.value || '';
    const dateEnd = filterDateEnd?.value || '';
    const amtMin = parseCurrency(filterAmountMin?.value || '0');
    const amtMax = parseCurrency(filterAmountMax?.value || '0');
    activeFilter = { search, cat, dateStart, dateEnd, amtMin, amtMax };
    renderFilteredTransactions();
};

const renderFilteredTransactions = () => {
    if (!fullTransactionList) return;
    fullTransactionList.innerHTML = '';
    let filtered = [...transactions];
    if (activeFilter) {
        const f = activeFilter;
        if (f.search) filtered = filtered.filter(t => t.text.toLowerCase().includes(f.search));
        if (f.cat) filtered = filtered.filter(t => t.category === f.cat);
        if (f.dateStart) filtered = filtered.filter(t => t.date && t.date.split('T')[0] >= f.dateStart);
        if (f.dateEnd) filtered = filtered.filter(t => t.date && t.date.split('T')[0] <= f.dateEnd);
        if (f.amtMin > 0) filtered = filtered.filter(t => t.amount >= f.amtMin);
        if (f.amtMax > 0) filtered = filtered.filter(t => t.amount <= f.amtMax);
    }
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
    if (filtered.length === 0) {
        fullTransactionList.innerHTML = '<div class="empty-state"><i class="fa-solid fa-search"></i><p>Tidak ada transaksi ditemukan.</p></div>';
    } else {
        filtered.forEach(t => fullTransactionList.appendChild(createTransactionDOM(t)));
    }
};

if (toggleFilterBtn) toggleFilterBtn.addEventListener('click', () => { vibrate(30); filterBar.style.display = filterBar.style.display === 'none' ? 'block' : 'none'; });
if (filterApplyBtn) filterApplyBtn.addEventListener('click', () => { vibrate(30); applyFilter(); });
if (filterResetBtn) filterResetBtn.addEventListener('click', () => {
    vibrate(30);
    if (filterSearch) filterSearch.value = '';
    if (filterCategory) filterCategory.value = '';
    if (filterDateStart) filterDateStart.value = '';
    if (filterDateEnd) filterDateEnd.value = '';
    if (filterAmountMin) filterAmountMin.value = '';
    if (filterAmountMax) filterAmountMax.value = '';
    activeFilter = null;
    renderFilteredTransactions();
});
[filterAmountMin, filterAmountMax].forEach(el => { if (el) { el.type = 'text'; el.inputMode = 'numeric'; el.addEventListener('input', formatInputCurrency); } });

// --- LAPORAN PERIODIK ---
let reportChartInstance = null;
const reportPeriod = document.getElementById('report-period');
const reportTotalIncome = document.getElementById('report-total-income');
const reportTotalExpense = document.getElementById('report-total-expense');
const reportBalance = document.getElementById('report-balance');
const reportCategoryBreakdown = document.getElementById('report-category-breakdown');
const reportChartCtx = document.getElementById('reportChart')?.getContext('2d');
const exportReportBtn = document.getElementById('export-report-btn');

const getReportTransactions = (period) => {
    const now = new Date();
    let startDate;
    if (period === 'weekly') { startDate = new Date(now); startDate.setDate(now.getDate() - 7); }
    else if (period === 'monthly') { startDate = new Date(now.getFullYear(), now.getMonth(), 1); }
    else { startDate = new Date(now.getFullYear(), 0, 1); }
    return transactions.filter(t => new Date(t.date) >= startDate);
};

const renderReport = () => {
    if (!reportPeriod) return;
    const period = reportPeriod.value;
    const periodTx = getReportTransactions(period);
    const income = periodTx.filter(t => t.type === 'income').reduce((a, b) => a + b.amount, 0);
    const expense = periodTx.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
    if (reportTotalIncome) reportTotalIncome.textContent = formatRupiah(income);
    if (reportTotalExpense) reportTotalExpense.textContent = formatRupiah(expense);
    if (reportBalance) reportBalance.textContent = formatRupiah(income - expense);

    // Category breakdown
    if (reportCategoryBreakdown) {
        const catTotals = {};
        periodTx.forEach(t => { if (t.type === 'expense') catTotals[t.category] = (catTotals[t.category]||0) + t.amount; });
        const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
        reportCategoryBreakdown.innerHTML = '';
        if (sorted.length === 0) {
            reportCategoryBreakdown.innerHTML = '<p style="color: var(--text-muted);">Belum ada data pengeluaran.</p>';
        } else {
            sorted.forEach(([cat, total]) => {
                const pct = expense > 0 ? ((total / expense) * 100).toFixed(1) : 0;
                const icon = categoryMap[cat] || categoryMap['Lainnya'];
                reportCategoryBreakdown.innerHTML += `<div style="display: flex; align-items: center; gap: 1rem; padding: 0.75rem; background: rgba(0,0,0,0.2); border-radius: 12px; margin-bottom: 0.5rem;"><div class="trans-cat-icon" style="width: 35px; height: 35px; font-size: 1rem;">${icon}</div><div style="flex: 1;"><div style="font-weight: 600;">${cat}</div><div style="font-size: 0.8rem; color: var(--text-muted);">${formatRupiah(total)} (${pct}%)</div></div><div class="progress-bar-wrapper" style="width: 80px; height: 6px;"><div class="progress-bar" style="width: ${pct}%; background: var(--primary-gradient);"></div></div></div>`;
            });
        }
    }

    // Chart
    if (reportChartCtx) {
        const catTotals = {};
        periodTx.forEach(t => { if (t.type === 'expense') catTotals[t.category] = (catTotals[t.category]||0) + t.amount; });
        const labels = Object.keys(catTotals);
        const data = Object.values(catTotals);
        const chartColors = ['#00f2fe', '#fb7185', '#22d3ee', '#f5576c', '#818cf8', '#a1a1aa'];
        if (reportChartInstance) reportChartInstance.destroy();
        if (data.length === 0) {
            reportChartInstance = new Chart(reportChartCtx, { type: 'doughnut', data: { labels: ['Belum ada data'], datasets: [{ data: [1], backgroundColor: ['#1e293b'], borderWidth: 0 }] }, options: { cutout: '75%', plugins: { legend: { display: false } } } });
        } else {
            reportChartInstance = new Chart(reportChartCtx, { type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: chartColors, borderWidth: 2, borderColor: '#050505', hoverOffset: 10 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'right', labels: { color: '#ffffff', font: { family: 'Outfit', size: 12 } } } } } });
        }
    }
};

if (reportPeriod) reportPeriod.addEventListener('change', () => { vibrate(30); renderReport(); });
if (exportReportBtn) exportReportBtn.addEventListener('click', () => {
    vibrate(50);
    const period = reportPeriod?.value || 'monthly';
    const periodTx = getReportTransactions(period);
    const periodLabel = period === 'weekly' ? 'Mingguan' : period === 'monthly' ? 'Bulanan' : 'Tahunan';
    const income = periodTx.filter(t => t.type === 'income').reduce((a, b) => a + b.amount, 0);
    const expense = periodTx.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
    let reportText = `=== LAPORAN KEUANGAN ${periodLabel.toUpperCase()} ===\n\n`;
    reportText += `Total Pemasukan: ${formatRupiah(income)}\nTotal Pengeluaran: ${formatRupiah(expense)}\nSelisih: ${formatRupiah(income - expense)}\n\n`;
    reportText += `--- DETAIL TRANSAKSI ---\n`;
    periodTx.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(t => {
        reportText += `[${t.type === 'income' ? 'MASUK' : 'KELUAR'}] ${formatRupiah(t.amount)} - ${t.text} (${t.category}) - ${formatDate(t.date)}\n`;
    });
    const blob = new Blob([reportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `Laporan_Nabung_${periodLabel}.txt`; a.click();
});

// --- INCOME CATEGORY MANAGEMENT ---
const incomeCategoriesList = document.getElementById('income-categories-list');
const newIncomeCategoryInput = document.getElementById('new-income-category');
const addIncomeCategoryBtn = document.getElementById('add-income-category-btn');

const renderIncomeCategoriesList = () => {
    if (!incomeCategoriesList) return;
    incomeCategoriesList.innerHTML = '';
    incomeCategories.forEach((cat, i) => {
        const tag = document.createElement('span');
        tag.classList.add('income-cat-tag');
        tag.innerHTML = `${cat} <button onclick="removeIncomeCategory(${i})" style="background: none; border: none; color: var(--expense); cursor: pointer; font-size: 0.9rem; padding: 0;">&times;</button>`;
        incomeCategoriesList.appendChild(tag);
    });
};

window.removeIncomeCategory = (index) => {
    vibrate(30);
    incomeCategories.splice(index, 1);
    localStorage.setItem('nabung_income_categories', JSON.stringify(incomeCategories));
    renderIncomeCategoriesList();
    renderIncomeCategories();
};

if (addIncomeCategoryBtn) {
    addIncomeCategoryBtn.addEventListener('click', () => {
        vibrate(30);
        const name = newIncomeCategoryInput?.value.trim();
        if (!name || incomeCategories.includes(name)) return;
        incomeCategories.push(name);
        localStorage.setItem('nabung_income_categories', JSON.stringify(incomeCategories));
        newIncomeCategoryInput.value = '';
        renderIncomeCategoriesList();
        renderIncomeCategories();
    });
}

// --- WALLET MANAGEMENT ---
const walletsList = document.getElementById('wallets-list');
const newWalletNameInput = document.getElementById('new-wallet-name');
const addWalletBtn = document.getElementById('add-wallet-btn');

const renderWallets = () => {
    if (!walletsList) return;
    walletsList.innerHTML = '';
    if (wallets.length === 0) {
        walletsList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem;">Belum ada dompet.</p>';
        return;
    }
    wallets.forEach(w => {
        const walletBalance = transactions.filter(t => t.walletId === w.id).reduce((a, b) => a + (b.type === 'income' ? b.amount : -b.amount), 0);
        const div = document.createElement('div');
        div.classList.add('wallet-item');
        div.innerHTML = `<div><strong>${w.name}</strong><span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 0.5rem;">${formatRupiah(walletBalance)}</span></div><button onclick="removeWallet('${w.id}')" style="background: none; border: none; color: var(--expense); cursor: pointer;"><i class="fa-solid fa-trash"></i></button>`;
        walletsList.appendChild(div);
    });
};

window.removeWallet = (id) => {
    vibrate(50);
    wallets = wallets.filter(w => w.id !== id);
    localStorage.setItem('nabung_wallets', JSON.stringify(wallets));
    renderWallets();
};

if (addWalletBtn) {
    addWalletBtn.addEventListener('click', () => {
        vibrate(30);
        const name = newWalletNameInput?.value.trim();
        if (!name) return;
        wallets.push({ id: 'w_' + generateID(), name });
        localStorage.setItem('nabung_wallets', JSON.stringify(wallets));
        newWalletNameInput.value = '';
        renderWallets();
    });
}

// --- NOTIFICATION SYSTEM ---
const notifBudgetWarning = document.getElementById('notif-budget-warning');
const notifDailyReminder = document.getElementById('notif-daily-reminder');
const notifGoalReminder = document.getElementById('notif-goal-reminder');
const requestNotifPermissionBtn = document.getElementById('request-notif-permission');

const loadNotifSettings = () => {
    if (notifBudgetWarning) notifBudgetWarning.checked = notifSettings.budgetWarning;
    if (notifDailyReminder) notifDailyReminder.checked = notifSettings.dailyReminder;
    if (notifGoalReminder) notifGoalReminder.checked = notifSettings.goalReminder;
};

const saveNotifSettings = () => {
    notifSettings = {
        budgetWarning: notifBudgetWarning?.checked || false,
        dailyReminder: notifDailyReminder?.checked || false,
        goalReminder: notifGoalReminder?.checked || false
    };
    localStorage.setItem('nabung_notif', JSON.stringify(notifSettings));
};

const sendNotification = (title, body) => {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: 'ai_logo.png' });
    }
};

const checkNotifications = () => {
    if (!notifSettings.budgetWarning && !notifSettings.goalReminder) return;
    if (monthlyBudget > 0 && notifSettings.budgetWarning) {
        const currMonthExpense = transactions.filter(t => t.type === 'expense' && new Date(t.date).getMonth() === new Date().getMonth()).reduce((a, b) => a + b.amount, 0);
        const pct = (currMonthExpense / monthlyBudget) * 100;
        if (pct >= 80 && pct < 100) sendNotification('Peringatan Budget!', `Pengeluaran Anda sudah ${pct.toFixed(0)}% dari budget bulanan.`);
        else if (pct >= 100) sendNotification('Budget Habis!', 'Pengeluaran Anda sudah melebihi budget bulanan!');
    }
    if (notifSettings.goalReminder && goals.length > 0) {
        goals.forEach(g => {
            const gBal = getGoalBalance(g.id);
            const pct = (gBal / g.amount) * 100;
            if (pct >= 100) sendNotification('Target Tercapai!', `Target '${g.name}' sudah tercapai!`);
        });
    }
};

if (notifBudgetWarning) notifBudgetWarning.addEventListener('change', saveNotifSettings);
if (notifDailyReminder) notifDailyReminder.addEventListener('change', saveNotifSettings);
if (notifGoalReminder) notifGoalReminder.addEventListener('change', saveNotifSettings);
if (requestNotifPermissionBtn) {
    requestNotifPermissionBtn.addEventListener('click', () => {
        vibrate(30);
        if ('Notification' in window) {
            Notification.requestPermission().then(perm => {
                if (perm === 'granted') alert('Notifikasi diaktifkan!');
                else alert('Notifikasi ditolak oleh browser.');
            });
        } else {
            alert('Browser Anda tidak mendukung notifikasi.');
        }
    });
}

// --- UNDO SYSTEM ---
const updateUndoBtn = () => {
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) undoBtn.style.display = actionHistory.length > 0 ? 'flex' : 'none';
};

const undoLastAction = () => {
    if (actionHistory.length === 0) return;
    vibrate(50);
    const action = actionHistory.pop();
    if (action.type === 'delete-transaction') { transactions.push(action.data); updateLocalStorage(); }
    else if (action.type === 'delete-goal') { goals.push(action.data); localStorage.setItem('nabung_goals', JSON.stringify(goals)); }
    updateUndoBtn();
    init();
};

const undoBtn = document.getElementById('undo-btn');
if (undoBtn) undoBtn.addEventListener('click', undoLastAction);

// --- AUTO-BACKUP SYSTEM ---
const autoBackup = () => {
    const backup = { transactions, goals, wallets, incomeCategories, groups, currencyConfig, notifSettings, monthlyBudget, recurringSavings, recurringTransactions, theme: localStorage.getItem('nabung_theme'), pin: appPin };
    localStorage.setItem('nabung_auto_backup_data', JSON.stringify(backup));
    localStorage.setItem('nabung_auto_backup_time', new Date().toISOString());
};

const restoreAutoBackup = () => {
    const raw = localStorage.getItem('nabung_auto_backup_data');
    if (!raw) { alert('Tidak ada auto-backup ditemukan.'); return; }
    try {
        const data = JSON.parse(raw);
        if (data.transactions) { transactions = data.transactions; updateLocalStorage(); }
        if (data.goals) { goals = data.goals; localStorage.setItem('nabung_goals', JSON.stringify(goals)); }
        if (data.wallets) { wallets = data.wallets; localStorage.setItem('nabung_wallets', JSON.stringify(wallets)); }
        if (data.incomeCategories) { incomeCategories = data.incomeCategories; localStorage.setItem('nabung_income_categories', JSON.stringify(incomeCategories)); }
        if (data.groups) { groups = data.groups; localStorage.setItem('nabung_groups', JSON.stringify(groups)); }
        if (data.currencyConfig) { currencyConfig = data.currencyConfig; localStorage.setItem('nabung_currency', JSON.stringify(currencyConfig)); }
        if (data.notifSettings) { notifSettings = data.notifSettings; localStorage.setItem('nabung_notif', JSON.stringify(notifSettings)); }
        if (data.monthlyBudget !== undefined) { monthlyBudget = data.monthlyBudget; localStorage.setItem('nabung_budget', monthlyBudget); }
        if (data.recurringSavings) { recurringSavings = data.recurringSavings; localStorage.setItem('nabung_recurring_savings', JSON.stringify(recurringSavings)); }
        if (data.recurringTransactions) { recurringTransactions = data.recurringTransactions; localStorage.setItem('nabung_recurring_transactions', JSON.stringify(recurringTransactions)); }
        alert('Backup berhasil dipulihkan!'); init();
    } catch(e) { alert('Backup tidak valid!'); }
};

const autoBackupToggle = document.getElementById('auto-backup-toggle');
const restoreBackupBtn = document.getElementById('restore-backup-btn');
if (autoBackupToggle) { autoBackupToggle.checked = autoBackupEnabled; autoBackupToggle.addEventListener('change', () => { autoBackupEnabled = autoBackupToggle.checked; localStorage.setItem('nabung_auto_backup', autoBackupEnabled); if (autoBackupEnabled) autoBackup(); }); }
if (restoreBackupBtn) restoreBackupBtn.addEventListener('click', () => { vibrate(30); restoreAutoBackup(); });

// --- MULTI-CURRENCY ---
const currencySelect = document.getElementById('currency-select');
const saveCurrencyBtn = document.getElementById('save-currency-btn');
const currencyMap = {
    'IDR': { code: 'IDR', symbol: 'Rp', locale: 'id-ID' },
    'USD': { code: 'USD', symbol: '$', locale: 'en-US' },
    'EUR': { code: 'EUR', symbol: '€', locale: 'de-DE' },
    'JPY': { code: 'JPY', symbol: '¥', locale: 'ja-JP' },
    'GBP': { code: 'GBP', symbol: '£', locale: 'en-GB' },
    'MYR': { code: 'MYR', symbol: 'RM', locale: 'ms-MY' },
    'SGD': { code: 'SGD', symbol: 'S$', locale: 'en-SG' }
};
if (currencySelect) currencySelect.value = currencyConfig.code;
if (saveCurrencyBtn) saveCurrencyBtn.addEventListener('click', () => {
    vibrate(30);
    const val = currencySelect?.value;
    if (val && currencyMap[val]) { currencyConfig = currencyMap[val]; localStorage.setItem('nabung_currency', JSON.stringify(currencyConfig)); alert('Mata uang disimpan!'); init(); }
});

// --- RECEIPT PHOTO ---
const transReceiptInput = document.getElementById('trans-receipt');
const receiptPreview = document.getElementById('receipt-preview');
const receiptImg = document.getElementById('receipt-img');
const removeReceiptBtn = document.getElementById('remove-receipt-btn');

if (transReceiptInput) {
    transReceiptInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { alert('Ukuran foto maksimal 2MB!'); return; }
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxW = 800, maxH = 600;
                let w = img.width, h = img.height;
                if (w > maxW) { h = h * maxW / w; w = maxW; }
                if (h > maxH) { w = w * maxH / h; h = maxH; }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                pendingReceiptData = canvas.toDataURL('image/jpeg', 0.6);
                receiptImg.src = pendingReceiptData;
                receiptPreview.style.display = 'block';
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });
}
if (removeReceiptBtn) removeReceiptBtn.addEventListener('click', () => {
    pendingReceiptData = null;
    if (transReceiptInput) transReceiptInput.value = '';
    receiptPreview.style.display = 'none';
});

const closeSheetWithReceipt = () => {
    transactionSheet.classList.remove('open');
    editingTransactionId = null;
    pendingReceiptData = null;
    if (transReceiptInput) transReceiptInput.value = '';
    if (receiptPreview) receiptPreview.style.display = 'none';
    const submitBtn = transactionForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Simpan Transaksi';
};
// Override closeSheet
const _origCloseSheet = closeSheet;
closeSheet = closeSheetWithReceipt;

const viewReceipt = (receiptData) => {
    const viewer = document.getElementById('image-viewer');
    const viewerImg = document.getElementById('image-viewer-img');
    if (viewer && viewerImg && receiptData) { viewerImg.src = receiptData; viewer.classList.add('open'); }
};

document.addEventListener('click', (e) => {
    const indicator = e.target.closest('.receipt-indicator');
    if (!indicator) return;
    const txItem = indicator.closest('.transaction-item');
    if (!txItem) return;
    const allTx = [...transactions];
    const descEl = txItem.querySelector('.trans-desc');
    const dateEl = txItem.querySelector('.trans-date');
    if (!descEl || !dateEl) return;
    const match = allTx.find(t => t.text === descEl.textContent && t.receipt);
    if (match && match.receipt) viewReceipt(match.receipt);
});
const closeImageViewer = () => { const v = document.getElementById('image-viewer'); if (v) v.classList.remove('open'); };
const closeImageBtn = document.getElementById('close-image-btn');
const imageOverlay = document.getElementById('image-overlay');
if (closeImageBtn) closeImageBtn.addEventListener('click', closeImageViewer);
if (imageOverlay) imageOverlay.addEventListener('click', closeImageViewer);

// Add receipt to transaction creation
const _origSubmitHandler = transactionForm.onsubmit;
transactionForm.removeEventListener('submit', transactionForm.onsubmit);
transactionForm.addEventListener('submit', (e) => {
    e.preventDefault(); vibrate(50);
    const text = document.getElementById('trans-desc').value;
    const amount = parseCurrency(document.getElementById('trans-amount').value);
    const type = document.querySelector('input[name="trans-type"]:checked').value;
    let category = 'Lainnya';
    if (type === 'expense') { const catRadio = document.querySelector('input[name="trans-category"]:checked'); if (catRadio) category = catRadio.value; }
    else { const incCatRadio = document.querySelector('input[name="trans-income-category"]:checked'); category = incCatRadio ? incCatRadio.value : 'Pendapatan'; }
    if (text.trim() === '' || amount <= 0) { alert('Mohon masukkan data yang valid!'); return; }
    const goalId = transGoalSelect ? transGoalSelect.value : 'main';
    const walletId = document.getElementById('trans-wallet')?.value || '';
    const receipt = pendingReceiptData || null;

    if (editingTransactionId) {
        const idx = transactions.findIndex(t => t.id === editingTransactionId);
        if (idx !== -1) { transactions[idx] = { ...transactions[idx], text, amount, type, category, goalId, walletId, receipt }; }
        editingTransactionId = null;
    } else {
        transactions.push({ id: generateID(), text, amount, type, category, goalId, walletId, receipt, date: new Date().toISOString() });
    }
    updateLocalStorage(); init();
    document.getElementById('trans-desc').value = '';
    document.getElementById('trans-amount').value = '';
    closeSheetWithReceipt();
});

// --- TABUNGAN BERSAMA ---
const groupsList = document.getElementById('groups-list');
const groupForm = document.getElementById('group-form');
const addGroupBtn = document.getElementById('add-group-btn');
const cancelGroupBtn = document.getElementById('cancel-group-btn');

const renderGroups = () => {
    if (!groupsList) return;
    groupsList.innerHTML = '';
    if (groups.length === 0) { groupsList.innerHTML = '<div class="empty-state" style="padding: 1rem;"><p>Belum ada grup tabungan.</p></div>'; return; }
    groups.forEach(g => {
        const totalSaved = (g.contributions || []).reduce((a, b) => a + b.amount, 0);
        const progress = g.target > 0 ? Math.min((totalSaved / g.target) * 100, 100) : 0;
        const div = document.createElement('div');
        div.classList.add('goal-item');
        div.innerHTML = `
            <h3>${g.name}</h3>
            <button class="delete-goal-btn" onclick="removeGroup('${g.id}')"><i class="fa-solid fa-trash"></i></button>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem;">Anggota: ${(g.members||[]).join(', ') || 'Solo'}</p>
            <div class="progress-container">
                <div class="progress-labels">
                    <span>${formatRupiah(totalSaved)} / ${formatRupiah(g.target)}</span>
                    <span>${progress.toFixed(1)}%</span>
                </div>
                <div class="progress-bar-wrapper"><div class="progress-bar" style="width: 0%;"></div></div>
            </div>
            <div style="margin-top: 0.75rem; display: flex; gap: 0.5rem;">
                <button class="btn secondary-btn" onclick="addGroupContribution('${g.id}')" style="flex:1; padding: 0.6rem; font-size: 0.85rem; margin-top: 0;"><i class="fa-solid fa-plus"></i> Setor</button>
            </div>
        `;
        groupsList.appendChild(div);
        setTimeout(() => { const bar = div.querySelector('.progress-bar'); if (bar) bar.style.width = `${progress}%`; }, 100);
    });
};

window.removeGroup = (id) => { vibrate(50); groups = groups.filter(g => g.id !== id); localStorage.setItem('nabung_groups', JSON.stringify(groups)); renderGroups(); };

window.addGroupContribution = (id) => {
    const group = groups.find(g => g.id === id);
    if (!group) return;
    const amount = prompt(`Setor ke "${group.name}"\nMasukkan jumlah (Rp):`);
    if (!amount) return;
    const parsed = parseInt(amount.replace(/[^0-9]/g, ''));
    if (isNaN(parsed) || parsed <= 0) return;
    const member = prompt(`Siapa yang menyetor? (${(group.members||[]).join(', ') || 'Solo'})`) || 'Anda';
    if (!group.contributions) group.contributions = [];
    group.contributions.push({ member, amount: parsed, date: new Date().toISOString() });
    localStorage.setItem('nabung_groups', JSON.stringify(groups));
    vibrate(50);
    alert(`${member} menyetor ${formatRupiah(parsed)} ke "${group.name}"!`);
    renderGroups();
};

if (addGroupBtn) addGroupBtn.addEventListener('click', () => { vibrate(30); groupsList.classList.add('hidden'); groupForm.classList.remove('hidden'); document.getElementById('group-name-input').value = ''; document.getElementById('group-target-input').value = ''; document.getElementById('group-members-input').value = ''; });
if (cancelGroupBtn) cancelGroupBtn.addEventListener('click', () => { groupForm.classList.add('hidden'); groupsList.classList.remove('hidden'); });
if (groupForm) {
    groupForm.addEventListener('submit', (e) => {
        e.preventDefault(); vibrate(50);
        const name = document.getElementById('group-name-input').value.trim();
        const target = parseCurrency(document.getElementById('group-target-input').value);
        const membersStr = document.getElementById('group-members-input').value.trim();
        const members = membersStr ? membersStr.split(',').map(m => m.trim()).filter(m => m) : [];
        if (!name || target <= 0) return;
        groups.push({ id: 'g_' + generateID(), name, target, members, contributions: [] });
        localStorage.setItem('nabung_groups', JSON.stringify(groups));
        groupForm.classList.add('hidden'); groupsList.classList.remove('hidden');
        renderGroups();
    });
}
const groupTargetInput = document.getElementById('group-target-input');
if (groupTargetInput) { groupTargetInput.type = 'text'; groupTargetInput.inputMode = 'numeric'; groupTargetInput.addEventListener('input', formatInputCurrency); }

// --- DEEP ANALYTICS ---
let trendChartInstance = null;

const renderTrendChart = () => {
    const trendCtx = document.getElementById('trendChart')?.getContext('2d');
    if (!trendCtx) return;
    const now = new Date();
    const labels = [];
    const incomeData = [];
    const expenseData = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        labels.push(d.toLocaleString('id-ID', { month: 'short' }));
        const monthTx = transactions.filter(t => { const td = new Date(t.date); return td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear(); });
        incomeData.push(monthTx.filter(t => t.type === 'income').reduce((a, b) => a + b.amount, 0));
        expenseData.push(monthTx.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0));
    }
    if (trendChartInstance) trendChartInstance.destroy();
    trendChartInstance = new Chart(trendCtx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Pemasukan', data: incomeData, backgroundColor: 'rgba(34, 211, 238, 0.6)', borderRadius: 8 },
                { label: 'Pengeluaran', data: expenseData, backgroundColor: 'rgba(251, 113, 133, 0.6)', borderRadius: 8 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { x: { grid: { display: false } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a1a1aa', callback: v => formatRupiah(v) } } },
            plugins: { legend: { labels: { color: '#ffffff', font: { family: 'Outfit' } } } }
        }
    });
};

const renderDeepAnalytics = () => {
    if (!reportPeriod) return;
    const period = reportPeriod.value;
    const periodTx = getReportTransactions(period);
    const expenses = periodTx.filter(t => t.type === 'expense');
    const days = period === 'weekly' ? 7 : period === 'monthly' ? 30 : 365;
    const totalExpense = expenses.reduce((a, b) => a + b.amount, 0);
    const totalIncome = periodTx.filter(t => t.type === 'income').reduce((a, b) => a + b.amount, 0);
    const dailyAvg = days > 0 ? totalExpense / days : 0;
    const dailySave = days > 0 ? (totalIncome - totalExpense) / days : 0;
    const maxExp = expenses.length > 0 ? Math.max(...expenses.map(t => t.amount)) : 0;

    const dailyAvgEl = document.getElementById('report-daily-avg');
    const totalTxEl = document.getElementById('report-total-tx');
    const maxExpEl = document.getElementById('report-max-expense');
    const dailySaveEl = document.getElementById('report-daily-save');
    if (dailyAvgEl) dailyAvgEl.textContent = formatRupiah(dailyAvg);
    if (totalTxEl) totalTxEl.textContent = periodTx.length;
    if (maxExpEl) maxExpEl.textContent = formatRupiah(maxExp);
    if (dailySaveEl) dailySaveEl.textContent = formatRupiah(dailySave);
    renderTrendChart();
};

// Update renderReport to include deep analytics
const _origRenderReport = renderReport;
renderReport = () => { _origRenderReport(); renderDeepAnalytics(); };

// --- QUICK RECEIPT: Foto Struk -> Langsung Pengeluaran ---
(() => {
    const qrBtn = document.getElementById('quick-receipt-btn');
    const qrOverlay = document.getElementById('quick-receipt-overlay');
    const qrSheet = document.getElementById('quick-receipt-sheet');
    const qrCloseBtn = document.getElementById('close-quick-receipt');
    const qrUploadArea = document.getElementById('qr-upload-area');
    const qrFileInput = document.getElementById('qr-file-input');
    const qrPreview = document.getElementById('qr-preview');
    const qrPreviewImg = document.getElementById('qr-preview-img');
    const qrRemovePhoto = document.getElementById('qr-remove-photo');
    const qrAmount = document.getElementById('qr-amount');
    const qrDesc = document.getElementById('qr-desc');
    const qrCategories = document.getElementById('qr-categories');
    const qrSubmit = document.getElementById('qr-submit');

    let qrReceiptData = null;
    let qrSelectedCat = 'Makanan & Minuman';

    const defaultCats = ['Makanan & Minuman', 'Transportasi', 'Belanja', 'Hiburan', 'Kesehatan', 'Pendidikan', 'Tagihan', 'Lainnya'];

    const openQRSheet = () => {
        qrReceiptData = null;
        qrPreview.style.display = 'none';
        qrUploadArea.style.display = 'block';
        qrAmount.value = '';
        qrDesc.value = '';
        qrSubmit.disabled = true;
        qrSubmit.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Catat Pengeluaran';
        renderQRCategories();
        qrOverlay.style.display = 'block';
        qrSheet.style.display = 'block';
    };

    const closeQRSheet = () => {
        qrOverlay.style.display = 'none';
        qrSheet.style.display = 'none';
    };

    const renderQRCategories = () => {
        const cats = [...new Set([...defaultCats, ...categories])];
        qrCategories.innerHTML = '';
        cats.forEach(c => {
            const tag = document.createElement('span');
            tag.className = 'income-cat-tag' + (c === qrSelectedCat ? ' selected' : '');
            tag.textContent = c;
            tag.style.cursor = 'pointer';
            tag.addEventListener('click', () => { qrSelectedCat = c; renderQRCategories(); });
            qrCategories.appendChild(tag);
        });
    };

    const validateQR = () => {
        const amt = parseCurrency(qrAmount.value);
        qrSubmit.disabled = amt <= 0;
    };

    if (qrBtn) qrBtn.addEventListener('click', openQRSheet);
    if (qrCloseBtn) qrCloseBtn.addEventListener('click', closeQRSheet);
    if (qrOverlay) qrOverlay.addEventListener('click', closeQRSheet);
    if (qrUploadArea) qrUploadArea.addEventListener('click', () => qrFileInput.click());

    if (qrFileInput) {
        qrFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 2097152) {
                alert('Ukuran foto maksimal 2MB!');
                return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const maxW = 800, maxH = 600;
                    let w = img.width, h = img.height;
                    if (w > maxW) { h *= maxW / w; w = maxW; }
                    if (h > maxH) { w *= maxH / h; h = maxH; }
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    qrReceiptData = canvas.toDataURL('image/jpeg', 0.6);
                    qrPreviewImg.src = qrReceiptData;
                    qrPreview.style.display = 'block';
                    qrUploadArea.style.display = 'none';
                    vibrate(50);
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
            qrFileInput.value = '';
        });
    }

    if (qrRemovePhoto) {
        qrRemovePhoto.addEventListener('click', () => {
            qrReceiptData = null;
            qrPreview.style.display = 'none';
            qrUploadArea.style.display = 'block';
        });
    }

    if (qrAmount) qrAmount.addEventListener('input', validateQR);

    if (qrSubmit) {
        qrSubmit.addEventListener('click', () => {
            const amt = parseCurrency(qrAmount.value);
            if (amt <= 0) return;
            const desc = qrDesc.value.trim() || 'Pengeluaran dari struk';
            const goalId = transGoalSelect ? transGoalSelect.value : 'main';
            const walletId = document.getElementById('trans-wallet')?.value || '';

            const tx = {
                id: generateID(),
                text: desc,
                amount: amt,
                type: 'expense',
                category: qrSelectedCat,
                goalId,
                walletId,
                receipt: qrReceiptData,
                date: new Date().toISOString()
            };
            transactions.push(tx);
            updateLocalStorage();
            init();
            vibrate(100);
            closeQRSheet();
        });
    }
})();

// --- OVERRIDE INIT to include new renders ---
const _prevInit = init;
init = () => { _prevInit(); populateFilterCategories(); renderIncomeCategoriesList(); renderWallets(); renderReport(); loadNotifSettings(); checkNotifications(); renderGroups(); updateUndoBtn(); };
init();

