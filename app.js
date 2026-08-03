// ETF 交易策略系统 - 前端逻辑
let currentFilter = 'all';
let tradingData = null;
let autoRefreshInterval = null;
const REFRESH_INTERVAL = 30000; // 30秒自动刷新

// 坚果云配置 (用于直接读取)
const JIANGUOYUN_CONFIG = {
    username: 'picfik@126.com',
    password: 'a3x43k2ftu7bh2nr',
    url: 'https://dav.jianguoyun.com/dav/picfik-pwa/data.json'
};

// GitHub 数据源 (主要，因为无CORS问题)
const GITHUB_RAW_URL = 'https://picfik.github.io/picfik-py-pwa/data.json';

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    setupFilterButtons();
    loadData();
    startAutoRefresh();
});

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

// 加载数据 (优先从 GitHub Pages 加载)
async function loadData() {
    try {
        // 首先尝试从 GitHub Pages 加载 (同源或公开)
        const data = await fetchFromGitHub();
        if (data) {
            processData(data, 'GitHub Pages');
            return;
        }
        
        // 备份：从坚果云加载
        console.log('尝试从坚果云加载数据...');
        const jianguoyunData = await fetchFromJianguoyun();
        if (jianguoyunData) {
            processData(jianguoyunData, '坚果云');
            return;
        }
        
        // 最后尝试从本地路径 (如果直接打开HTML文件)
        console.log('尝试从本地加载...');
        const localData = await fetchFromLocal();
        if (localData) {
            processData(localData, '本地文件');
            return;
        }
        
        showError('无法加载数据，请检查数据源连接');
    } catch (error) {
        console.error('加载数据失败:', error);
        showError('加载数据失败: ' + error.message);
    }
}

// 从 GitHub Pages 获取数据
async function fetchFromGitHub() {
    try {
        const response = await fetch(GITHUB_RAW_URL + '?t=' + Date.now(), {
            headers: {
                'Accept': 'application/json'
            },
            cache: 'no-store'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('成功从 GitHub Pages 加载数据');
        return data;
    } catch (error) {
        console.log('GitHub Pages 加载失败:', error.message);
        return null;
    }
}

// 从坚果云获取数据 (使用 WebDAV)
async function fetchFromJianguoyun() {
    try {
        const credentials = btoa(`${JIANGUOYUN_CONFIG.username}:${JIANGUOYUN_CONFIG.password}`);
        
        const response = await fetch(JIANGUOYUN_CONFIG.url + '?t=' + Date.now(), {
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Accept': 'application/json'
            },
            cache: 'no-store'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('成功从坚果云加载数据');
        return data;
    } catch (error) {
        console.log('坚果云加载失败:', error.message);
        return null;
    }
}

// 从本地路径获取数据
async function fetchFromLocal() {
    try {
        const response = await fetch('data.json?t=' + Date.now(), {
            cache: 'no-store'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
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
    
    // 根据筛选条件过滤
    let filteredSignals = signals;
    if (currentFilter !== 'all') {
        filteredSignals = signals.filter(s => s.action === currentFilter);
    }
    
    if (filteredSignals.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="8">暂无符合条件的交易信号</td></tr>';
        return;
    }
    
    // 排序：按建议操作优先级
    const actionOrder = { '建仓': 0, '清仓': 1, '待确认': 2, '观望': 3 };
    filteredSignals.sort((a, b) => {
        const orderA = actionOrder[a.action] !== undefined ? actionOrder[a.action] : 99;
        const orderB = actionOrder[b.action] !== undefined ? actionOrder[b.action] : 99;
        return orderA - orderB;
    });
    
    filteredSignals.forEach((signal, index) => {
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

// 获取操作对应的CSS类
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
    
    // 滚动到详情区域
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
    console.log('手动刷新数据...');
    loadData();
}

// 自动刷新
function startAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    autoRefreshInterval = setInterval(() => {
        console.log('自动刷新数据...');
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
    console.log('网络已恢复，正在重新加载数据...');
    loadData();
});

window.addEventListener('offline', function() {
    console.log('网络已断开');
    document.getElementById('dataSource').textContent = '离线模式';
});
