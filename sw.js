// ETF 交易策略系统 - Service Worker
const CACHE_NAME = 'etf-trading-system-v2';
const DATA_CACHE_NAME = 'etf-data-cache';

// 需要缓存的核心资源
const CORE_ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json'
];

// 数据文件列表（使用网络优先策略）
const DATA_FILES = ['data.json', 'members.json', 'per_member_data.json'];

// 安装 Service Worker
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('缓存核心资源');
                return cache.addAll(CORE_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// 激活 Service Worker
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.filter((name) => {
                    return name !== CACHE_NAME && name !== DATA_CACHE_NAME;
                }).map((name) => {
                    console.log('删除旧缓存:', name);
                    return caches.delete(name);
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 拦截请求
self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);
    
    // 只处理 GET 请求
    if (event.request.method !== 'GET') return;
    
    // 检查是否为数据文件
    const isDataFile = DATA_FILES.some(f => requestUrl.pathname.endsWith(f));
    
    // 对于数据文件，使用网络优先策略
    if (isDataFile) {
        event.respondWith(
            fetch(event.request, { cache: 'no-store' })
                .then((networkResponse) => {
                    // 更新缓存
                    caches.open(DATA_CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                    });
                    return networkResponse;
                })
                .catch(() => {
                    // 网络失败时回退到缓存
                    return caches.match(event.request).then((cachedResponse) => {
                        if (cachedResponse) {
                            console.log('使用缓存的数据');
                            return cachedResponse;
                        }
                        // 都没有，返回离线提示
                        return new Response(
                            JSON.stringify({ error: '离线模式：无法获取最新数据' }),
                            { headers: { 'Content-Type': 'application/json' } }
                        );
                    });
                })
        );
        return;
    }
    
    // 对于其他资源，使用缓存优先策略
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // 在后台更新缓存
                fetch(event.request, { cache: 'no-store' }).then((networkResponse) => {
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse);
                    });
                }).catch(() => {});
                
                return cachedResponse;
            }
            
            // 不在缓存中，从网络获取
            return fetch(event.request).then((networkResponse) => {
                // 缓存成功的响应
                if (networkResponse.ok) {
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                    });
                }
                return networkResponse;
            }).catch((error) => {
                console.log('获取资源失败:', error);
                // 如果是HTML页面请求，可以返回离线页面
                if (event.request.headers.get('accept')?.includes('text/html')) {
                    return caches.match('./index.html');
                }
                throw error;
            });
        })
    );
});

// 监听消息
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
    if (event.data === 'clearCache') {
        caches.keys().then((cacheNames) => {
            cacheNames.forEach((name) => {
                caches.delete(name);
            });
        });
    }
});

// 后台同步 (如果需要)
self.addEventListener('sync', (event) => {
    if (event.tag === 'syncData') {
        event.waitUntil(syncData());
    }
});

async function syncData() {
    // 在这里可以实现后台数据同步逻辑
    console.log('后台数据同步');
}