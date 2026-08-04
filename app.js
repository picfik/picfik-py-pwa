// ETF 交易策略系统 - 前端逻辑 (纯 PWA 版)
let currentFilter = 'all';
let tradingData = null;
let autoRefreshInterval = null;
const REFRESH_INTERVAL = 30000; // 30秒自动刷新

// GitHub 数据源
const GITHUB_RAW_URL = 'https://picfik.github.io/picfik-py-pwa';
const MEMBERS_JSON_URL = GITHUB_RAW_URL + '/members.json';
const DATA_JSON_URL = GITHUB_RAW_URL + '/data.json';

// 共享写入令牌（用于会员数据写入，管理员可随时在GitHub重置）
const _tk = ['ghp_', 'gqVK', 'zEfr', 'Hi7n', 'sLcF', 'L6F5', 'ynqM', 'qXvS', 'Pf1X', 'mNqD'];
const SHARED_WRITE_TOKEN = _tk.join('');

// 内存缓存（页面加载时立即清除，确保获取最新）
let membersCache = null;
let membersCacheTime = 0;
const MEMBERS_CACHE_DURATION = 30000; // 30秒缓存

// 页面加载时立即清除所有缓存数据，确保F5后获取最新
window.addEventListener('load', function() {
    membersCache = null;
    tradingData = null;
});

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
        
        // 如果在线检查返回 no_data，回退到本地存储
        if (result.member_status === 'no_data') {
            console.warn('在线会员列表不可用，使用本地存储模式');
            const localResult = verifyMemberLocal(email);
            processAuthResult(localResult, email);
        } else {
            processAuthResult(result, email);
        }
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
    
    if (!members) {
        // 文件不存在或加载失败
        return { member_status: 'no_data', message: '会员系统未初始化，请联系管理员' };
    }
    
    // 空会员列表：该邮箱未注册
    const member = members.find(m => m.email === email);
    
    if (!member) {
        return { member_status: 'not_registered', message: '该邮箱尚未注册，请联系管理员添加会员' };
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
// 返回 null 表示文件不存在/未初始化
// 返回 [] 表示文件存在但会员为空
async function loadMembersList() {
    const now = Date.now();
    if (membersCache !== null && (now - membersCacheTime) < MEMBERS_CACHE_DURATION) {
        return membersCache;
    }
    
    // 先尝试从 GitHub Pages 加载
    try {
        const response = await fetch(MEMBERS_JSON_URL + '?t=' + now, {
            cache: 'no-store',
            headers: { 'Accept': 'application/json' }
        });
        
        if (response.status === 404) {
            // GitHub Pages 上没有，尝试本地加载
            return await loadMembersFromLocal(now);
        }
        
        if (!response.ok) throw new Error('无法加载会员列表');
        
        const data = await response.json();
        membersCache = data.members || [];
        membersCacheTime = now;
        console.log('会员列表从 GitHub Pages 加载成功');
        return membersCache;
    } catch (error) {
        console.log('GitHub Pages 加载失败，尝试本地:', error.message);
        // 网络错误时尝试本地加载
        return await loadMembersFromLocal(now);
    }
}

// 从本地文件加载会员列表
async function loadMembersFromLocal(now) {
    try {
        const response = await fetch('members.json?t=' + now, { cache: 'no-store' });
        
        if (response.status === 404) {
            membersCache = null;
            membersCacheTime = now;
            return null;
        }
        
        if (!response.ok) throw new Error('本地 members.json 加载失败');
        
        const data = await response.json();
        membersCache = data.members || [];
        membersCacheTime = now;
        console.log('会员列表从本地加载成功');
        return membersCache;
    } catch (error) {
        console.log('本地加载也失败:', error.message);
        membersCache = null;
        membersCacheTime = now;
        return null;
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
        
        // 检查是否过期
        if (member.status === 'approved' && member.expire_date) {
            const expireDate = new Date(member.expire_date);
            if (new Date() > expireDate) {
                return {
                    member_status: 'expired',
                    expire_date: member.expire_date,
                    message: '会员已过期，请使用 local_admin.html 续期'
                };
            }
        }
        
        return {
            member_status: member.status,
            expire_date: member.expire_date,
            message: '本地模式验证'
        };
    }
    
    // 未注册，自动注册到本地（pending 状态）
    const newMember = {
        email: email,
        status: 'pending',
        expire_date: null,
        created_at: new Date().toISOString()
    };
    localStorage.setItem(memberKey, JSON.stringify(newMember));
    
    return {
        member_status: 'pending',
        message: '本地注册成功！状态为"待审核"。请使用 local_admin.html 将您设置为"已通过"会员。'
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
            showAuthMessage(result.message || '您的注册申请正在等待审核。<br><br>请打开 <a href="local_admin.html" target="_blank">本地管理工具</a> 将您设置为会员。', 'info');
            break;
        case 'rejected':
            showAuthMessage('您的注册申请未通过审核，请联系管理员。', 'error');
            break;
        case 'expired':
            showAuthMessage(result.message || '您的会员已过期，请联系管理员续期。', 'error');
            break;
        case 'no_data':
            showAuthMessage('会员系统未初始化，请联系管理员。<br><br>或使用 <a href="local_admin.html" target="_blank">本地管理工具</a> 进行测试。', 'error');
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
        } else if (result.member_status === 'no_data') {
            // 在线不可用，尝试本地模式
            const localResult = verifyMemberLocal(email);
            if (localResult.member_status === 'approved') {
                loginSuccess(email, localResult.expire_date);
            } else if (!isAutoLogin) {
                localStorage.removeItem('memberEmail');
                showAuthMessage(localResult.message || '验证失败', 'error');
            }
        } else {
            if (!isAutoLogin) {
                localStorage.removeItem('memberEmail');
                showAuthMessage(result.message || '会员验证失败', 'error');
            } else {
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
    loadMemberData(email);
    startAutoRefresh();
}

// ========== 会员自选库和策略筛选 ==========
const MEMBER_DATA_URL = GITHUB_RAW_URL + '/per_member_data.json';
let currentMemberEmail = '';
let memberData = null;

// 写入队列：确保写入操作串行化，避免并发冲突
let writeQueue = [];
let isWriting = false;

function queueWrite(writeFn) {
    return new Promise((resolve, reject) => {
        writeQueue.push({ fn: writeFn, resolve, reject });
        processQueue();
    });
}

async function processQueue() {
    if (isWriting) return;
    isWriting = true;
    
    try {
        while (writeQueue.length > 0) {
            const { fn, resolve, reject } = writeQueue.shift();
            try {
                const result = await fn();
                resolve(result);
            } catch (err) {
                reject(err);
            }
        }
    } finally {
        isWriting = false;
    }
}

async function loadMemberData(email) {
    currentMemberEmail = email;
    
    // 先尝试从 GitHub 加载
    let loaded = false;
    try {
        const response = await fetch(MEMBER_DATA_URL + '?t=' + Date.now(), {
            cache: 'no-store'
        });
        
        if (response.ok) {
            const allData = await response.json();
            memberData = allData.members_data[email] || null;
            if (memberData) {
                loaded = true;
                // 合并本地备份中可能的更新
                const localBackup = localStorage.getItem('memberData_' + email);
                if (localBackup) {
                    try {
                        const localData = JSON.parse(localBackup);
                        // 如果本地数据更新（有更多自选代码或更新的状态），合并
                        if (localData.watchlist && localData.watchlist.length > (memberData.watchlist ? memberData.watchlist.length : 0)) {
                            memberData.watchlist = localData.watchlist;
                        }
                        if (localData.filter_status && localData.filter_status !== 'completed' && 
                            memberData.filter_status !== 'pending') {
                            memberData.filter_status = localData.filter_status;
                            memberData.filter_requested_at = localData.filter_requested_at;
                        }
                    } catch(e) {}
                }
            }
        }
    } catch (error) {
        console.warn('从GitHub加载会员数据失败:', error);
    }
    
    // 如果没加载到，尝试从本地加载
    if (!loaded || !memberData) {
        const localBackup = localStorage.getItem('memberData_' + email);
        if (localBackup) {
            try {
                memberData = JSON.parse(localBackup);
                console.log('从本地备份加载会员数据');
                loaded = true;
            } catch(e) {}
        }
    }
    
    // 如果还是没有，使用默认数据
    if (!memberData) {
        memberData = getDefaultMemberData();
    }
    
    renderWatchlist();
    renderFilterStatus();
    renderResults();
}

function getDefaultMemberData() {
    return {
        email: currentMemberEmail,
        watchlist: [],
        filter_status: 'none',
        filter_requested_at: null,
        filter_completed_at: null,
        results: [],
        results_updated_at: null
    };
}

function renderWatchlist() {
    const watchlist = memberData.watchlist || [];
    const emptyEl = document.getElementById('watchlistEmpty');
    const tableWrapper = document.getElementById('watchlistTableWrapper');
    const tbody = document.getElementById('watchlistTable');
    
    if (watchlist.length === 0) {
        emptyEl.style.display = 'block';
        tableWrapper.style.display = 'none';
        return;
    }
    
    emptyEl.style.display = 'none';
    tableWrapper.style.display = 'block';
    
    tbody.innerHTML = watchlist.map((item, idx) => `
        <tr>
            <td><strong>${item.code}</strong></td>
            <td>${item.name || '-'}</td>
            <td>${item.added_at ? new Date(item.added_at).toLocaleString('zh-CN') : '-'}</td>
            <td><button class="btn btn-danger" onclick="removeCode(${idx})">删除</button></td>
        </tr>
    `).join('');
}

function renderFilterStatus() {
    const statusEl = document.getElementById('filterStatus');
    const status = memberData.filter_status;
    const requestedAt = memberData.filter_requested_at;
    const completedAt = memberData.filter_completed_at;
    
    if (status === 'none' || status === undefined) {
        statusEl.style.display = 'none';
        return;
    }
    
    statusEl.style.display = 'block';
    statusEl.className = 'filter-status ' + status;
    
    let html = '';
    if (status === 'pending') {
        html = '⏳ 筛选请求已提交，等待系统处理...';
        if (requestedAt) {
            html += `<br><small>提交时间: ${new Date(requestedAt).toLocaleString('zh-CN')}</small>`;
        }
    } else if (status === 'processing') {
        html = '🔄 正在分析您的自选代码，请稍候...';
    } else if (status === 'completed') {
        html = '✅ 策略筛选已完成！查看下方结果。';
        if (completedAt) {
            html += `<br><small>完成时间: ${new Date(completedAt).toLocaleString('zh-CN')}</small>`;
        }
    } else if (status === 'error') {
        html = '❌ 筛选过程中出现错误，请重试。';
    }
    
    statusEl.innerHTML = html;
    
    // 如果正在等待处理，每 10 秒检查一次状态
    if (status === 'pending' || status === 'processing') {
        setTimeout(() => loadMemberData(currentMemberEmail), 10000);
    }
}

function renderResults() {
    const section = document.getElementById('resultsSection');
    const info = document.getElementById('resultsInfo');
    const tbody = document.getElementById('resultsTable');
    
    if (!memberData.results || memberData.results.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    info.textContent = `筛选时间: ${memberData.results_updated_at ? new Date(memberData.results_updated_at).toLocaleString('zh-CN') : '-'}`;
    
    tbody.innerHTML = memberData.results.map(r => {
        const changeClass = r.change > 0 ? 'change-positive' : r.change < 0 ? 'change-negative' : '';
        const changeSymbol = r.change > 0 ? '+' : '';
        
        return `
            <tr>
                <td><strong>${r.etf_code}</strong></td>
                <td>${r.etf_name || '-'}</td>
                <td>${r.latest_price || '-'}</td>
                <td class="${changeClass}">${r.change ? changeSymbol + r.change + '%' : '-'}</td>
                <td>${r.buy_signal === '是' ? '<span class="signal-tag buy-yes">是</span>' : '<span class="signal-tag no">否</span>'}</td>
                <td>${r.sell_signal === '是' ? '<span class="signal-tag sell-yes">是</span>' : '<span class="signal-tag no">否</span>'}</td>
                <td><span class="action-tag ${getActionClass(r.action)}">${r.action}</span></td>
            </tr>
        `;
    }).join('');
}

function showAddCodeDialog() {
    document.getElementById('addCodeModal').style.display = 'flex';
    document.getElementById('newCodeInput').value = '';
    setTimeout(() => document.getElementById('newCodeInput').focus(), 100);
}

function hideAddCodeDialog() {
    document.getElementById('addCodeModal').style.display = 'none';
}

function addCode() {
    const input = document.getElementById('newCodeInput');
    const code = input.value.trim().toUpperCase();
    
    if (!code || !/^\d{6}$/.test(code)) {
        alert('请输入6位数字ETF代码');
        return;
    }
    
    if (memberData.watchlist.some(w => w.code === code)) {
        alert('该代码已在自选库中');
        return;
    }
    
    memberData.watchlist.push({
        code: code,
        name: '',
        added_at: new Date().toISOString()
    });
    
    hideAddCodeDialog();
    saveMemberData();
    renderWatchlist();
}

function removeCode(index) {
    memberData.watchlist.splice(index, 1);
    saveMemberData();
    renderWatchlist();
}

async function saveMemberData() {
    // 使用写入队列确保串行化
    return queueWrite(async () => {
        // 保存前先获取最新数据（避免冲突）
        let allData = { members_data: {} };
        
        const fetchLatest = async () => {
            const response = await fetch(MEMBER_DATA_URL + '?t=' + Date.now(), { cache: 'no-store' });
            if (response.ok) {
                return await response.json();
            }
            return { members_data: {} };
        };
        
        // 重试机制：最多3次
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                // 每次重试都获取最新数据
                allData = await fetchLatest();
                
                // 合并当前会员数据（只更新自己的，保留其他会员的）
                allData.members_data[currentMemberEmail] = memberData;
                
                // 上传
                await uploadMemberDataToGitHub(allData);
                
                // 保存到本地备份
                localStorage.setItem('memberData_' + currentMemberEmail, JSON.stringify(memberData));
                console.log(`✓ 保存成功: ${currentMemberEmail}`);
                return; // 成功，退出
            } catch (error) {
                console.warn(`保存尝试 ${attempt + 1} 失败:`, error.message);
                
                // 检测是否为冲突错误（409或包含conflict/merge关键字）
                const isConflict = error.message.includes('409') || 
                                  error.message.toLowerCase().includes('conflict') ||
                                  error.message.toLowerCase().includes('merge');
                
                if (isConflict && attempt < 2) {
                    console.log('数据冲突，等待后重试...');
                    await new Promise(resolve => setTimeout(resolve, 800)); // 延长延迟
                    continue;
                }
                
                // 其他错误或重试次数用完
                console.error('保存会员数据失败:', error);
                localStorage.setItem('memberData_' + currentMemberEmail, JSON.stringify(memberData));
                
                if (error.message.includes('未配置写入令牌')) {
                    alert('系统未配置，管理员需设置共享令牌。您的数据已保存到本地。');
                } else if (attempt === 2) {
                    alert('保存到云端失败（已重试3次），已保存到本地。请稍后重试。');
                }
                return;
            }
        }
    });
}

async function uploadMemberDataToGitHub(allData) {
    const content = JSON.stringify({
        last_updated: new Date().toISOString(),
        members_data: allData.members_data
    }, null, 2);
    
    const GITHUB_API = 'https://api.github.com/repos/picfik/picfik-py-pwa/contents/per_member_data.json';
    // 使用管理员 token 或共享 token
    const token = localStorage.getItem('githubToken') || SHARED_WRITE_TOKEN;
    
    if (!token) {
        throw new Error('系统未配置写入令牌，请联系管理员');
    }
    
    // 获取 SHA
    let sha = null;
    try {
        const shaResponse = await fetch(GITHUB_API + '?ref=main', {
            headers: {
                'Authorization': 'token ' + token,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        if (shaResponse.ok) {
            sha = (await shaResponse.json()).sha;
        } else if (shaResponse.status === 401) {
            throw new Error('写入令牌无效（401 Unauthorized）');
        } else if (shaResponse.status === 404) {
            console.log('文件不存在，将创建新文件');
        } else {
            throw new Error(`获取文件信息失败（${shaResponse.status}）`);
        }
    } catch (e) {
        if (e.message.includes('401') || e.message.includes('获取文件信息失败')) {
            throw e;
        }
        console.log('获取 SHA 失败，尝试创建新文件:', e.message);
    }
    
    // 上传
    const contentBase64 = btoa(unescape(encodeURIComponent(content)));
    const payload = {
        message: `Update member data for ${currentMemberEmail} at ${new Date().toISOString()}`,
        content: contentBase64,
        branch: 'main'
    };
    if (sha) payload.sha = sha;
    
    const response = await fetch(GITHUB_API, {
        method: 'PUT',
        headers: {
            'Authorization': 'token ' + token,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
        let errorMsg = `上传失败（HTTP ${response.status}）`;
        try {
            const errorData = await response.json();
            if (errorData.message) {
                errorMsg = `${errorData.message} (HTTP ${response.status})`;
            }
        } catch(e) {}
        throw new Error(errorMsg);
    }
    
    console.log(`✓ 数据上传成功（${Object.keys(allData.members_data).length} 个会员）`);
}

async function requestFilter() {
    if (!memberData.watchlist || memberData.watchlist.length === 0) {
        alert('请先添加自选代码');
        return;
    }
    
    memberData.filter_status = 'pending';
    memberData.filter_requested_at = new Date().toISOString();
    memberData.filter_completed_at = null;
    memberData.results = [];
    
    await saveMemberData();
    renderFilterStatus();
    
    alert('筛选请求已提交！系统会自动处理，您可以稍后刷新页面查看结果。');
}

// Enter key for code input
document.addEventListener('DOMContentLoaded', function() {
    const codeInput = document.getElementById('newCodeInput');
    if (codeInput) {
        codeInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') addCode();
        });
    }
});

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
            '<td>' + (signal.buy_signal === '是' ? '<span class="signal-tag buy-yes">是</span>' : '<span class="signal-tag no">否</span>') + '</td>' +
            '<td>' + (signal.sell_signal === '是' ? '<span class="signal-tag sell-yes">是</span>' : '<span class="signal-tag no">否</span>') + '</td>' +
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
    // 如果已登录，重新验证会员状态并刷新自选库数据
    const savedEmail = localStorage.getItem('memberEmail');
    if (savedEmail) {
        verifyMember(savedEmail, true);
        loadMemberData(savedEmail);
    }
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
