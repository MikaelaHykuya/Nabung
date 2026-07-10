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

// Utilities
const formatRupiah = (number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);
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
    
    let insight = "Saya memantau keuangan Anda. Semuanya terlihat stabil sejauh ini.";
    
    if (transactions.length === 0) {
        insight = "Halo! Saya adalah AI Advisor Anda. Mulailah mencatat transaksi pertama Anda agar saya bisa menganalisisnya.";
    } else if (expense > income && income > 0) {
        insight = "⚠️ Peringatan: Pengeluaran Anda melebihi pemasukan. Kurangi belanja yang tidak perlu bulan ini!";
    } else if (balance > 0 && goals.length > 0) {
        // Cek target terdekat
        let closestGoal = null;
        let highestProgress = 0;
        goals.forEach(g => {
            const gBal = getGoalBalance(g.id);
            const progress = (gBal / g.amount) * 100;
            if (progress >= highestProgress) { highestProgress = progress; closestGoal = g; }
        });
        
        if (highestProgress >= 100) {
            insight = `🎉 Selamat! Target menabung '${closestGoal.name}' Anda sudah tercapai. Waktunya mewujudkannya!`;
        } else if (highestProgress > 80) {
            insight = `🔥 Semangat! Anda sudah mencapai ${highestProgress.toFixed(0)}% dari target '${closestGoal.name}'. Sedikit lagi!`;
        } else {
            // Cek kategori pengeluaran terbesar
            const catTotals = {};
            transactions.forEach(t => { if(t.type === 'expense') catTotals[t.category] = (catTotals[t.category]||0) + t.amount; });
            let maxCat = ''; let maxCatAmount = 0;
            for(let c in catTotals) { if(catTotals[c] > maxCatAmount) { maxCatAmount = catTotals[c]; maxCat = c; } }
            
            if (maxCatAmount > (income * 0.4)) {
                insight = `💡 Analisis: Anda menghabiskan banyak uang untuk kategori '${maxCat}'. Cobalah untuk sedikit berhemat di area ini.`;
            } else {
                insight = `Keuangan Anda sehat! Teruslah menabung untuk mencapai target-target Anda.`;
            }
        }
    } else if (balance > 0) {
         insight = "Kondisi keuangan Anda positif. Coba buat 'Target Tabungan' agar Anda memiliki tujuan menabung yang jelas!";
    }

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
    const iconHTML = categoryMap[cat] || categoryMap['Lainnya'];
    
    li.innerHTML = `
        <div class="trans-left-group">
            <div class="trans-cat-icon">${iconHTML}</div>
            <div class="trans-info">
                <span class="trans-desc">${transaction.text}</span>
                <span class="trans-date">${formatDate(transaction.date)}</span>
            </div>
        </div>
        <div style="display: flex; align-items: center;">
            <span class="trans-amount">${sign}${formatRupiah(transaction.amount)}</span>
            <button class="delete-btn" onclick="removeTransaction(${transaction.id}, event)"><i class="fa-solid fa-trash"></i></button>
        </div>
    `;
    return li;
};

let init = () => {
    if(recentTransactionList) recentTransactionList.innerHTML = '';
    if(desktopRecentTransactionList) desktopRecentTransactionList.innerHTML = '';
    if(fullTransactionList) fullTransactionList.innerHTML = '';
    
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
const closeSheet = () => transactionSheet.classList.remove('open');
if(fabAdd) fabAdd.addEventListener('click', openSheet);
if(desktopAddBtn) desktopAddBtn.addEventListener('click', openSheet);
if(sheetOverlay) sheetOverlay.addEventListener('click', closeSheet);
if(closeModalBtn) closeModalBtn.addEventListener('click', closeSheet);
const transGoalSelect = document.getElementById('trans-goal');

document.querySelectorAll('.radio-label, .cat-label').forEach(label => label.addEventListener('click', () => vibrate(20)));

// Toggle category selector based on Income vs Expense
const typeRadios = document.querySelectorAll('input[name="trans-type"]');
const catGroup = document.querySelector('.category-group');
typeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        if(e.target.value === 'income') {
            catGroup.classList.add('hidden');
        } else {
            catGroup.classList.remove('hidden');
        }
    });
});
// Trigger change on load to set initial state
const checkedType = document.querySelector('input[name="trans-type"]:checked');
if(checkedType && checkedType.value === 'income') {
    if(catGroup) catGroup.classList.add('hidden');
}

transactionForm.addEventListener('submit', (e) => {
    e.preventDefault();
    vibrate(50);
    
    const text = document.getElementById('trans-desc').value;
    const amount = parseCurrency(document.getElementById('trans-amount').value);
    const type = document.querySelector('input[name="trans-type"]:checked').value;
    
    let category = 'Lainnya';
    if(type === 'expense') {
        const catRadio = document.querySelector('input[name="trans-category"]:checked');
        if(catRadio) category = catRadio.value;
    } else {
        category = 'Pendapatan';
    }
    
    if (text.trim() === '' || amount <= 0) {
        alert('Mohon masukkan data yang valid!');
        return;
    }
    
    const goalId = transGoalSelect ? transGoalSelect.value : 'main';
    
    const transaction = { id: generateID(), text, amount, type, category, goalId, date: new Date().toISOString() };
    transactions.push(transaction);
    updateLocalStorage();
    init();
    
    document.getElementById('trans-desc').value = '';
    document.getElementById('trans-amount').value = '';
    closeSheet();
});

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
        goals.push({ id: generateID(), name, amount });
        localStorage.setItem('nabung_goals', JSON.stringify(goals));
        goalForm.classList.add('hidden');
        goalsList.classList.remove('hidden');
        updateDashboard();
    });
}

const generateID = () => Math.floor(Math.random() * 100000000);
window.removeTransaction = (id, event) => {
    event.stopPropagation(); vibrate(50);
    transactions = transactions.filter(transaction => transaction.id !== id);
    updateLocalStorage(); init();
};
window.removeGoal = (id) => {
    vibrate(50); goals = goals.filter(goal => goal.id !== id);
    localStorage.setItem('nabung_goals', JSON.stringify(goals));
    updateDashboard();
};
const updateLocalStorage = () => localStorage.setItem('nabung_transactions', JSON.stringify(transactions));

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
init();

// --- SECURITY & SETTINGS ---
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

