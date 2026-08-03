// ETF 交易策略系统 - 前端逻辑 (纯 PWA 版)
let currentFilter = 'all';
let tradingData = null;
let autoRefreshInterval = null;
const REFRESH_INTERVAL = 30000; // 30秒自动刷新

// GitHub 数据源
const GITHUB_RAW_URL = 'https://picfik.github.io/picfik-py-pwa';
const MEMBERS_JSON_URL = GITHUB_RAW_URL + '/members.json';
const DATA_JSON_URL = GITHUB_RAW_URL + '/data.json';

// 内存缓存（避免频繁请求）
let membersCache = null;
let membersCacheTime = 0;
const MEMBERS_CACHE_DURATION = 30000; // 30秒缓存

// ========== 会员认证逻辑 ==========

document.addEventListener('DOMContentLoaded', function() {
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    setupFilterButtons();
    
    // 检查是否已登录
    const savedEmail = localStorage.getItem('memberEmail');
    if (savedEmail) {
        verifyMember(savedEmail, true);
    }
    
    document.getElementById('emailInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') handleAuth();
    });
});

async function handleAuth() {
    const email = document.getElementById('emailInput').value.trim();
    
    if (!email) {
        showAuthMessage('请输入电子邮箱地址', 'error');
        return;
    }
    
    if (!isValidEmail(email)) {
        showAuthMessage('请输入有效的电子邮箱地址', 'error');
        return;
    }
    
    showAuthLoading(true);
    
    try {
        const result = await verifyMemberOnline(email);
        processAuthResult(result, email);
    } catch (error) {
        // 网络错误，使用本地存储回退
        console.warn('网络错误，使用本地存储模式:', error.message);
        const localResult = verifyMemberLocal(email);
        processAuthResult(localResult, email);
    }
    
    showAuthLoading(false);
}

// 从 GitHub Pages 加载会员列表并验证
async function verifyMemberOnline(email) {
    const members = await loadMembersList();
    
    if (!members || members.length === 0) {
        return { member_status: 'no_data', message: '会员列表为空，请联系管理员初始化系统' };
    }
    
    const member = members.find(m => m.email === email);
    
    if (!member) {
        return { member_status: 'not_registered', message: '该邮箱尚未注册' };
    }
    
    // 检查是否过期
    if (member.status === 'approved' && member.expire_date) {
        const expireDate = new Date(member.expire_date);
        const now = new Date();
        if (now > expireDate) {
            return { member_status: 'expired', message: '会员已过期，请联系管理员续期' };
        }
    }
    
    return {
        member_status: member.status,
        expire_date: member.expire_date,
        message: getStatusMessage(member.status)
    };
}

// 加载会员列表（带缓存）
async function loadMembersList() {
    const now = Date.now();
    if (membersCache && (now - membersCacheTime) < MEMBERS_CACHE_DURATION) {
        return membersCache;
    }
    
    try {
        const response = await fetch(MEMBERS_JSON_URL + '?t=' + now, {
            cache: 'no-store',
            headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) throw new Error('无法加载会员列表');
        
        const data = await response.json();
        membersCache = data.members || [];
        membersCacheTime = now;
        return membersCache;
    } catch (error) {
        console.log('加载会员列表失败:', error.message);
        throw error;
    }
}

function getStatusMessage(status) {
    const messages = {
        'approved': '会员验证通过',
        'pending': '正在等待管理员审核',
        'rejected': '注册申请未通过',
        'expired': '会员已过期'
    };
    return messages[status] || '未知状态';
}

// 本地存储回退
function verifyMemberLocal(email) {
    const memberKey = 'member_' + email;
    const memberData = localStorage.getItem(memberKey);
    
    if (memberData) {
        const member = JSON.parse(memberData);
        return {
            member_status: member.status,
            expire_date: member.expire_date,
            message: '本地模式验证'
        };
    }
    
    // 未注册，自动注册到本地
    const newMember = {
        email: email,
        status: 'pending',
        expire_date: null,
        created_at: new Date().toISOString()
    };
    localStorage.setItem(memberKey, JSON.stringify(newMember));
    
    return {
        member_status: 'not_registered',
        message: '本地注册成功！请等待管理员审核'
    };
}

function processAuthResult(result, email) {
    switch (result.member_status) {
        case 'approved':
            loginSuccess(email, result.expire_date);
            break;
        case 'not_registered':
            showAuthMessage('该邮箱尚未注册，请联系管理员添加会员。<br><br>管理员入口：<a href="admin.html" target="_blank">admin.html</a>', 'info');
            break;
        case 'pending':
            showAuthMessage('您的注册申请正在等待管理员审核，请稍后再试。<br><br>如需立即开通，请联系管理员。', 'info');
            break;
        case 'rejected':
            showAuthMessage('您的注册申请未通过审核，请联系管理员。', 'error');
            break;
        case 'expired':
            showAuthMessage('您的会员已过期，请联系管理员续期。', 'error');
            break;
        case 'no_data':
            showAuthMessage('系统会员列表尚未初始化，请联系管理员先登录 admin.html 创建会员数据。', 'error');
            break;
        default:
            showAuthMessage(result.message || '验证失败', 'error');
    }
}

async function verifyMember(email, isAutoLogin) {
    showAuthLoading(true);
    
    try {
        const result = await verifyMemberOnline(email);
        
        if (result.member_status === 'approved') {
            loginSuccess(email, result.expire_date);
        } else {
            localStorage.removeItem('memberEmail');
            if (!isAutoLogin) {
                showAuthMessage(result.message || '会员验证失败', 'error');
            } else {
                // 自动登录时不显示错误
                console.log('会员状态异常:', result.member_status);
            }
        }
    } catch (error) {
        if (!isAutoLogin) {
            showAuthMessage('验证失败: ' + error.message, 'error');
        }
    }
    
    showAuthLoading(false);
}

function loginSuccess(email, expireDate) {
    localStorage.setItem('memberEmail', email);
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    document.getElementById('memberExpire').textContent = expireDate || '未设置';
    
    loadData();
    startAutoRefresh();
}

function logout() {
    localStorage.removeItem('memberEmail');
    document.getElementById('mainContent').style.display = 'none';
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('emailInput').value = '';
    showAuthMessage('', '');
    document.getElementById('authMessage').style.display = 'none';
    
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showAuthMessage(message, type) {
    const msgDiv = document.getElementById('authMessage');
    if (!message) {
        msgDiv.style.display = 'none';
        return;
    }
    msgDiv.style.display = 'block';
    msgDiv.innerHTML = message;
    msgDiv.className = 'auth-message ' + type;
}

function showAuthLoading(show) {
    document.getElementById('authForm').style.display = show ? 'none' : 'block';
    document.getElementById('authLoading').style.display = show ? 'flex' : 'none';
}

// ========== 数据加载逻辑 ==========

function updateCurrentTime() {
    const now = new Date();
    const utc8Time = new Date(now.getTime() + (now.getTimezoneOffset() + 8) * 60000);
    document.getElementById('currentTime').textContent = '🕐 ' + formatDateTime(utc8Time);
}

function formatDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return year + '-' + month + '-' + day + ' ' + hours + ':' + minutes + ':' + seconds;
}

async function loadData() {
    try {
        const data = await fetchDataFromGitHub();
        if (data) {
            processData(data, 'GitHub Pages');
            return;
        }
        
        const localData = await fetchDataFromLocal();
        if (localData) {
            processData(localData, '本地文件');
            return;
        }
        
        showError('无法加载交易数据，请先运行 Python 脚本生成 data.json');
    } catch (error) {
        showError('加载数据失败: ' + error.message);
    }
}

async function fetchDataFromGitHub() {
    try {
        const response = await fetch(DATA_JSON_URL + '?t=' + Date.now(), {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store'
        });
        
        if (!response.ok) throw new Error('data.json 不存在，请先运行 Python 脚本');
        
        const data = await response.json();
        console.log('成功从 GitHub Pages 加载数据');
        return data;
    } catch (error) {
        console.log('GitHub Pages 加载失败:', error.message);
        return null;
    }
}

async function fetchDataFromLocal() {
    try {
        const response = await fetch('data.json?t=' + Date.now(), { cache: 'no-store' });
        if (!response.ok) throw new Error('本地 data.json 不存在');
        const data = await response.json();
        return data;
    } catch (error) {
        return null;
    }
}

function processData(data, source) {
    if (!data || !data.signals || !Array.isArray(data.signals)) {
        showError('数据格式错误');
        return;
    }
    
    tradingData = data;
    document.getElementById('lastUpdated').textContent = data.last_updated || '未知';
    document.getElementById('dataSource').textContent = source;
    
    updateSummary(data.signals);
    renderTable(data.signals);
}

function updateSummary(signals) {
    document.getElementById('buyCount').textContent = signals.filter(s => s.action === '建仓').length;
    document.getElementById('sellCount').textContent = signals.filter(s => s.action === '清仓').length;
    document.getElementById('watchCount').textContent = signals.filter(s => s.action === '观望').length;
    document.getElementById('confirmCount').textContent = signals.filter(s => s.action === '待确认').length;
}

function renderTable(signals) {
    const tbody = document.getElementById('etfTable');
    tbody.innerHTML = '';
    
    let filteredSignals = currentFilter === 'all' ? signals : signals.filter(s => s.action === currentFilter);
    
    if (filteredSignals.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="8">暂无符合条件的交易信号</td></tr>';
        return;
    }
    
    const actionOrder = { '建仓': 0, '清仓': 1, '待确认': 2, '观望': 3 };
    filteredSignals.sort((a, b) => {
        const orderA = actionOrder[a.action] !== undefined ? actionOrder[a.action] : 99;
        const orderB = actionOrder[b.action] !== undefined ? actionOrder[b.action] : 99;
        return orderA - orderB;
    });
    
    filteredSignals.forEach(signal => {
        const row = document.createElement('tr');
        row.onclick = () => showDetail(signal);
        
        const changeClass = signal.change > 0 ? 'change-positive' : signal.change < 0 ? 'change-negative' : '';
        const changeSymbol = signal.change > 0 ? '+' : '';
        
        row.innerHTML = 
            '<td><strong>' + signal.etf_code + '</strong></td>' +
            '<td>' + (signal.etf_name || '-') + '</td>' +
            '<td>' + (signal.latest_price || '-') + '</td>' +
            '<td class="' + changeClass + '">' + (signal.change ? changeSymbol + signal.change + '%' : '-') + '</td>' +
            '<td>' + (signal.buy_signal === '是' ? '<span class="signal-tag yes">是</span>' : '<span class="signal-tag no">否</span>') + '</td>' +
            '<td>' + (signal.sell_signal === '是' ? '<span class="signal-tag yes">是</span>' : '<span class="signal-tag no">否</span>') + '</td>' +
            '<td><span class="action-tag ' + getActionClass(signal.action) + '">' + signal.action + '</span></td>' +
            '<td>' + (signal.has_position === '是' ? '✅' : '❌') + '</td>';
        
        tbody.appendChild(row);
    });
}

function getActionClass(action) {
    return { '建仓': 'buy', '清仓': 'sell', '观望': 'watch', '待确认': 'confirm' }[action] || 'watch';
}

function showDetail(signal) {
    const section = document.getElementById('detailSection');
    const content = document.getElementById('detailContent');
    section.style.display = 'block';
    
    content.innerHTML = 
        '<div class="detail-item">' +
            '<h4>📊 基本信息</h4>' +
            '<div class="info-row"><span class="info-label">ETF 代码:</span><span class="info-value">' + signal.etf_code + '</span></div>' +
            '<div class="info-row"><span class="info-label">ETF 名称:</span><span class="info-value">' + (signal.etf_name || '-') + '</span></div>' +
            '<div class="info-row"><span class="info-label">最新价格:</span><span class="info-value">' + (signal.latest_price || '-') + '</span></div>' +
            '<div class="info-row"><span class="info-label">涨跌幅:</span><span class="info-value">' + (signal.change ? signal.change + '%' : '-') + '</span></div>' +
            '<div class="info-row"><span class="info-label">数据日期:</span><span class="info-value">' + (signal.latest_date || '-') + '</span></div>' +
        '</div>' +
        '<div class="detail-item">' +
            '<h4>📈 交易信号分析</h4>' +
            '<div class="info-row"><span class="info-label">买入信号:</span><span class="info-value">' + signal.buy_signal + '</span></div>' +
            '<div class="info-row"><span class="info-label">买入原因:</span><span class="info-value">' + (signal.buy_reason || '-') + '</span></div>' +
            '<div class="info-row"><span class="info-label">卖出信号:</span><span class="info-value">' + signal.sell_signal + '</span></div>' +
            '<div class="info-row"><span class="info-label">卖出原因:</span><span class="info-value">' + (signal.sell_reason || '-') + '</span></div>' +
        '</div>' +
        '<div class="detail-item">' +
            '<h4>🎯 操作建议</h4>' +
            '<div class="info-row"><span class="info-label">建议操作:</span><span class="info-value"><span class="action-tag ' + getActionClass(signal.action) + '">' + signal.action + '</span></span></div>' +
            '<div class="info-row"><span class="info-label">建议详情:</span><span class="info-value">' + (signal.suggestion || '-') + '</span></div>' +
            '<div class="info-row"><span class="info-label">是否持仓:</span><span class="info-value">' + (signal.has_position === '是' ? '已持仓' : '未持仓') + '</span></div>' +
            '<div class="info-row"><span class="info-label">分析时间:</span><span class="info-value">' + (signal.date || '-') + '</span></div>' +
        '</div>';
    
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setupFilterButtons() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.dataset.filter;
            if (tradingData && tradingData.signals) renderTable(tradingData.signals);
        });
    });
}

function refreshData() {
    membersCache = null; // 清除缓存
    loadData();
    // 如果已登录，重新验证会员状态
    const savedEmail = localStorage.getItem('memberEmail');
    if (savedEmail) verifyMember(savedEmail, true);
}

function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(() => {
        loadData();
        // 定期检查会员状态
        const savedEmail = localStorage.getItem('memberEmail');
        if (savedEmail && Math.random() < 0.3) { // 30% 概率检查，减少请求
            verifyMember(savedEmail, true);
        }
    }, REFRESH_INTERVAL);
}

function showError(message) {
    document.getElementById('etfTable').innerHTML = 
        '<tr class="error-row"><td colspan="8" style="color: #e74c3c; text-align: center;">❌ ' + message + '</td></tr>';
}

window.addEventListener('online', loadData);
window.addEventListener('offline', () => {
    document.getElementById('dataSource').textContent = '离线模式';
});
