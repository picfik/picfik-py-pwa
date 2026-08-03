// ETF 交易策略系统 - 前端逻辑
let currentFilter = 'all';
let tradingData = null;
let autoRefreshInterval = null;
const REFRESH_INTERVAL = 30000; // 30秒自动刷新

// 会员 API 地址
const MEMBER_API_URL = 'https://picfik.com/member_api.php';

// 坚果云配置
const JIANGUOYUN_CONFIG = {
    username: 'picfik@126.com',
    password: 'a3x43k2ftu7bh2nr',
    url: 'https://dav.jianguoyun.com/dav/picfik-pwa/data.json'
};

// GitHub 数据源
const GITHUB_RAW_URL = 'https://picfik.github.io/picfik-py-pwa/data.json';

// ========== 会员认证逻辑 ==========

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    setupFilterButtons();
    
    // 检查是否已登录
    const savedEmail = localStorage.getItem('memberEmail');
    if (savedEmail) {
        verifyMember(savedEmail, true);
    }
    
    // 回车键登录
    document.getElementById('emailInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') handleAuth();
    });
});

// 处理注册/登录
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
        // 先尝试验证（检查是否已注册）
        const verifyResult = await fetch(MEMBER_API_URL + '?action=verify&email=' + encodeURIComponent(email))
            .then(r => r.json());
        
        if (verifyResult.member_status === 'approved') {
            // 已是会员，直接登录
            loginSuccess(email, verifyResult.expire_date);
        } else if (verifyResult.member_status === 'not_registered') {
            // 未注册，自动注册
            const registerResult = await fetch(MEMBER_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'register', email: email })
            }).then(r => r.json());
            
            if (registerResult.status === 'success') {
                showAuthMessage('注册成功！请等待管理员审核开通会员权限后再次登录。', 'info');
            } else {
                showAuthMessage(registerResult.message || '注册失败', 'error');
            }
        } else if (verifyResult.member_status === 'pending') {
            showAuthMessage('您的注册申请正在等待管理员审核，请稍后再试。', 'info');
        } else if (verifyResult.member_status === 'rejected') {
            showAuthMessage('您的注册申请未通过审核，请联系管理员。', 'error');
        } else if (verifyResult.member_status === 'expired') {
            showAuthMessage('您的会员已过期，请联系管理员续期。', 'error');
        } else {
            showAuthMessage(verifyResult.message || '验证失败', 'error');
        }
    } catch (error) {
        showAuthMessage('网络错误，请稍后重试: ' + error.message, 'error');
    }
    
    showAuthLoading(false);
}

// 验证会员状态
async function verifyMember(email, isAutoLogin) {
    showAuthLoading(true);
    
    try {
        const result = await fetch(MEMBER_API_URL + '?action=verify&email=' + encodeURIComponent(email))
            .then(r => r.json());
        
        if (result.member_status === 'approved') {
            loginSuccess(email, result.expire_date);
        } else {
            // 状态已变，清除登录
            localStorage.removeItem('memberEmail');
            if (!isAutoLogin) {
                showAuthMessage(result.message || '会员验证失败', 'error');
            }
        }
    } catch (error) {
        if (!isAutoLogin) {
            showAuthMessage('验证失败: ' + error.message, 'error');
        }
    }
    
    showAuthLoading(false);
}

// 登录成功
function loginSuccess(email, expireDate) {
    localStorage.setItem('memberEmail', email);
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    document.getElementById('memberExpire').textContent = expireDate || '未设置';
    
    // 加载数据
    loadData();
    startAutoRefresh();
}

// 退出登录
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

// 验证邮箱格式
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// 显示认证消息
function showAuthMessage(message, type) {
    const msgDiv = document.getElementById('authMessage');
    if (!message) {
        msgDiv.style.display = 'none';
        return;
    }
    msgDiv.style.display = 'block';
    msgDiv.textContent = message;
    msgDiv.className = 'auth-message ' + type;
}

// 显示/隐藏加载状态
function showAuthLoading(show) {
    document.getElementById('authForm').style.display = show ? 'none' : 'block';
    document.getElementById('authLoading').style.display = show ? 'flex' : 'none';
}

// ========== 数据加载逻辑 ==========

// 更新当前时间 (中国大陆时间)
function updateCurrentTime() {
    const now = new Date();
    const utc8Time = new Date(now.getTime() + (now.getTimezoneOffset() + 8) * 60000);
    const timeStr = formatDateTime(utc8Time);
    document.getElementById('currentTime').textContent = `🕐 ${timeStr}`;
}

// 格式化日期时间
function formatDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 加载数据
async function loadData() {
    try {
        const data = await fetchFromGitHub();
        if (data) {
            processData(data, 'GitHub Pages');
            return;
        }
        
        const localData = await fetchFromLocal();
        if (localData) {
            processData(localData, '本地文件');
            return;
        }
        
        showError('无法加载数据，请检查数据源连接');
    } catch (error) {
        showError('加载数据失败: ' + error.message);
    }
}

// 从 GitHub Pages 获取数据
async function fetchFromGitHub() {
    try {
        const response = await fetch(GITHUB_RAW_URL + '?t=' + Date.now(), {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store'
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        console.log('成功从 GitHub Pages 加载数据');
        return data;
    } catch (error) {
        console.log('GitHub Pages 加载失败:', error.message);
        return null;
    }
}

// 从本地路径获取数据
async function fetchFromLocal() {
    try {
        const response = await fetch('data.json?t=' + Date.now(), { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        console.log('成功从本地加载数据');
        return data;
    } catch (error) {
        console.log('本地加载失败:', error.message);
        return null;
    }
}

// 处理和显示数据
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

// 更新汇总统计
function updateSummary(signals) {
    const buyCount = signals.filter(s => s.action === '建仓').length;
    const sellCount = signals.filter(s => s.action === '清仓').length;
    const watchCount = signals.filter(s => s.action === '观望').length;
    const confirmCount = signals.filter(s => s.action === '待确认').length;
    
    document.getElementById('buyCount').textContent = buyCount;
    document.getElementById('sellCount').textContent = sellCount;
    document.getElementById('watchCount').textContent = watchCount;
    document.getElementById('confirmCount').textContent = confirmCount;
}

// 渲染表格
function renderTable(signals) {
    const tbody = document.getElementById('etfTable');
    tbody.innerHTML = '';
    
    let filteredSignals = signals;
    if (currentFilter !== 'all') {
        filteredSignals = signals.filter(s => s.action === currentFilter);
    }
    
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
    
    filteredSignals.forEach((signal) => {
        const row = document.createElement('tr');
        row.onclick = () => showDetail(signal);
        
        const changeClass = signal.change > 0 ? 'change-positive' : 
                            signal.change < 0 ? 'change-negative' : '';
        const changeSymbol = signal.change > 0 ? '+' : '';
        
        row.innerHTML = `
            <td><strong>${signal.etf_code}</strong></td>
            <td>${signal.etf_name || '-'}</td>
            <td>${signal.latest_price || '-'}</td>
            <td class="${changeClass}">${signal.change ? changeSymbol + signal.change + '%' : '-'}</td>
            <td>${signal.buy_signal === '是' ? '<span class="signal-tag yes">是</span>' : '<span class="signal-tag no">否</span>'}</td>
            <td>${signal.sell_signal === '是' ? '<span class="signal-tag yes">是</span>' : '<span class="signal-tag no">否</span>'}</td>
            <td><span class="action-tag ${getActionClass(signal.action)}">${signal.action}</span></td>
            <td>${signal.has_position === '是' ? '✅' : '❌'}</td>
        `;
        
        tbody.appendChild(row);
    });
}

function getActionClass(action) {
    switch (action) {
        case '建仓': return 'buy';
        case '清仓': return 'sell';
        case '观望': return 'watch';
        case '待确认': return 'confirm';
        default: return 'watch';
    }
}

// 显示详情
function showDetail(signal) {
    const section = document.getElementById('detailSection');
    const content = document.getElementById('detailContent');
    
    section.style.display = 'block';
    
    content.innerHTML = `
        <div class="detail-item">
            <h4>📊 基本信息</h4>
            <div class="info-row"><span class="info-label">ETF 代码:</span><span class="info-value">${signal.etf_code}</span></div>
            <div class="info-row"><span class="info-label">ETF 名称:</span><span class="info-value">${signal.etf_name || '-'}</span></div>
            <div class="info-row"><span class="info-label">最新价格:</span><span class="info-value">${signal.latest_price}</span></div>
            <div class="info-row"><span class="info-label">涨跌幅:</span><span class="info-value">${signal.change ? signal.change + '%' : '-'}</span></div>
            <div class="info-row"><span class="info-label">数据日期:</span><span class="info-value">${signal.latest_date || '-'}</span></div>
        </div>
        
        <div class="detail-item">
            <h4>📈 交易信号分析</h4>
            <div class="info-row"><span class="info-label">买入信号:</span><span class="info-value">${signal.buy_signal}</span></div>
            <div class="info-row"><span class="info-label">买入原因:</span><span class="info-value">${signal.buy_reason || '-'}</span></div>
            <div class="info-row"><span class="info-label">卖出信号:</span><span class="info-value">${signal.sell_signal}</span></div>
            <div class="info-row"><span class="info-label">卖出原因:</span><span class="info-value">${signal.sell_reason || '-'}</span></div>
        </div>
        
        <div class="detail-item">
            <h4>🎯 操作建议</h4>
            <div class="info-row"><span class="info-label">建议操作:</span><span class="info-value"><span class="action-tag ${getActionClass(signal.action)}">${signal.action}</span></span></div>
            <div class="info-row"><span class="info-label">建议详情:</span><span class="info-value">${signal.suggestion || '-'}</span></div>
            <div class="info-row"><span class="info-label">是否持仓:</span><span class="info-value">${signal.has_position === '是' ? '已持仓' : '未持仓'}</span></div>
            <div class="info-row"><span class="info-label">分析时间:</span><span class="info-value">${signal.date || '-'}</span></div>
        </div>
    `;
    
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 设置筛选按钮
function setupFilterButtons() {
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', function() {
            buttons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.dataset.filter;
            
            if (tradingData && tradingData.signals) {
                renderTable(tradingData.signals);
            }
        });
    });
}

// 手动刷新
function refreshData() {
    loadData();
}

// 自动刷新
function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(() => {
        loadData();
    }, REFRESH_INTERVAL);
}

// 显示错误
function showError(message) {
    const tbody = document.getElementById('etfTable');
    tbody.innerHTML = `<tr class="error-row"><td colspan="8" style="color: #e74c3c; text-align: center;">❌ ${message}</td></tr>`;
}

// 在线状态检测
window.addEventListener('online', function() {
    loadData();
});

window.addEventListener('offline', function() {
    document.getElementById('dataSource').textContent = '离线模式';
});
