export const dashboardHtml = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>上稿 Noticer</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
</head>
<body class="bg-gray-50 min-h-screen">
    <div class="max-w-4xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
        <h1 class="text-3xl font-bold text-gray-900 mb-8">
            <i class="fas fa-satellite-dish mr-2 text-blue-500"></i>監控面板
        </h1>
        
        <div class="mb-6 flex flex-wrap gap-4">
            <button onclick="testPlatform('vita')" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded shadow transition-colors">
                <i class="fas fa-sync-alt mr-2"></i>手動檢查 Vita
            </button>
            <button onclick="testPlatform('peopo')" class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded shadow transition-colors">
                <i class="fas fa-sync-alt mr-2"></i>手動檢查 Peopo
            </button>
            <button onclick="fetchStatus()" class="bg-white border hover:bg-gray-50 text-gray-800 font-semibold py-2 px-4 rounded shadow-sm sm:ml-auto transition-colors">
                <i class="fas fa-redo mr-2 text-gray-500"></i>重新整理
            </button>
        </div>

        <div id="status-grid" class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="col-span-full text-center py-10 text-gray-500">
                <i class="fas fa-spinner fa-spin text-2xl mb-2"></i><br>
                載入中...
            </div>
        </div>
        
        <p id="last-updated" class="text-sm text-gray-400 mt-8 text-center"></p>
    </div>

    <script>
        async function fetchStatus() {
            try {
                const res = await fetch('/api/status');
                const data = await res.json();
                
                const grid = document.getElementById('status-grid');
                grid.innerHTML = '';
                
                if (!data || data.length === 0) {
                    grid.innerHTML = '<div class="col-span-full text-center text-gray-500 py-10 bg-white rounded-lg border">尚無監控資料</div>';
                    return;
                }

                data.forEach(item => {
                    const isSuccess = item.checking_status === 'success';
                    const statusColor = isSuccess ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200';
                    const statusIcon = isSuccess ? 'fa-check-circle text-green-500' : 'fa-exclamation-triangle text-red-500';
                    const statusText = isSuccess ? '正常 (Success)' : '異常/缺稿 (Missing)';

                    // Helper: 處理日期字串轉換 (API 已回傳 UTC+8，直接當作本地時間解析)
                    const toLocal = (timeStr) => {
                        if (!timeStr) return '無紀錄';
                        // 移除可能的 Z 並將空格轉為 T，避免被當作 UTC 進行多餘轉換
                        const t = timeStr.replace('Z', '').replace(' ', 'T'); 
                        return new Date(t).toLocaleString('zh-TW', {
                            year: 'numeric', month: '2-digit', day: '2-digit', 
                            hour: '2-digit', minute: '2-digit', second: '2-digit'
                        });
                    };

                    const card = \`
                        <div class="bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow">
                            <div class="flex justify-between items-start mb-5">
                                <h2 class="text-xl font-bold text-gray-800 uppercase flex items-center">
                                    <i class="fas fa-rss-square mr-2 text-gray-400"></i>\${item.platform}
                                </h2>
                                <span class="px-3 py-1.5 rounded-full text-sm font-semibold border \${statusColor} flex items-center">
                                    <i class="fas \${statusIcon} mr-1.5"></i> \${statusText}
                                </span>
                            </div>
                            
                            <div class="space-y-3 text-sm text-gray-600">
                                <p class="flex justify-between border-b border-gray-100 pb-2">
                                    <span class="font-medium text-gray-500">近期成功更新：</span>
                                    <span>\${toLocal(item.last_success_at)}</span>
                                </p>
                                <p class="flex justify-between border-b border-gray-100 pb-2">
                                    <span class="font-medium text-gray-500">最新文章 ID：</span>
                                    <span class="font-mono bg-gray-100 px-1 rounded">\${item.latest_post_id || '無'}</span>
                                </p>
                                <p class="flex justify-between border-b border-gray-100 pb-2">
                                    <span class="font-medium text-gray-500">最新文章標題：</span>
                                    <span class="truncate ml-4 flex-1 text-right" title="\${item.latest_title || '無'}">\${item.latest_title || '無'}</span>
                                </p>
                                \${item.latest_post_url ? \`
                                    <div class="pt-3">
                                        <a href="\${item.latest_post_url}" target="_blank" class="inline-flex items-center text-blue-600 hover:text-blue-800 hover:underline font-medium">
                                            <i class="fas fa-external-link-alt mr-1.5"></i>查看平台最新文章
                                        </a>
                                    </div>
                                \` : ''}
                            </div>
                        </div>
                    \`;
                    grid.innerHTML += card;
                });

                document.getElementById('last-updated').innerText = '頁面最後更新於：' + new Date().toLocaleString('zh-TW');

            } catch (err) {
                console.error(err);
                if (document.getElementById('status-grid').innerHTML.includes('載入中')) {
                    document.getElementById('status-grid').innerHTML = '<div class="col-span-full text-center text-red-500 py-10">無法獲取監控狀態資料，請確認 API 狀態。</div>';
                }
            }
        }

        async function testPlatform(platform) {
            const btn = event.currentTarget;
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>檢查中...';
            btn.disabled = true;
            btn.classList.add('opacity-70', 'cursor-not-allowed');

            try {
                const res = await fetch(\`/test-\${platform}\`);
                const msg = await res.text();
                
                setTimeout(() => {
                    fetchStatus(); // 重新讀取資料
                    alert(\`\${platform.toUpperCase()} 平台檢查完成：\\n\${msg}\`);
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                    btn.classList.remove('opacity-70', 'cursor-not-allowed');
                }, 500);
            } catch (err) {
                alert('檢查觸發失敗: ' + err.message);
                btn.innerHTML = originalText;
                btn.disabled = false;
                btn.classList.remove('opacity-70', 'cursor-not-allowed');
            }
        }

        fetchStatus();
        setInterval(fetchStatus, 5 * 60 * 1000);
    </script>
</body>
</html>
`;
